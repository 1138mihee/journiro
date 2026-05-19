exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  function extractJson(text) {
    if (!text) return null;
    const cleaned = text.replace(/```json|```/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end >= 0) return JSON.parse(cleaned.slice(start, end + 1));
    return JSON.parse(cleaned);
  }

  function hasHardInvalidText(plan) {
    const banned = ["장소 정보를 다시 생성해주세요", "다시 생성", "관광안내소", "대표 관광지"];
    const placesOnly = (plan?.days || [])
      .flatMap(d => d.slots || [])
      .map(s => s.place || "")
      .join(" ");
    return banned.some(word => placesOnly.includes(word));
  }

  function isValidPlan(plan) {
    if (!plan || !plan.intro || !Array.isArray(plan.days) || plan.days.length < 1) return false;
    let validSlotCount = 0;
    for (const day of plan.days) {
      if (!day.day || !Array.isArray(day.slots)) continue;
      for (const slot of day.slots) {
        if (slot.time && slot.place && slot.place.length >= 2 && slot.desc && slot.tag) validSlotCount++;
      }
    }
    return validSlotCount >= 3 && !hasHardInvalidText(plan);
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'OPENAI_API_KEY가 없습니다.' }) };
    }

    const body = JSON.parse(event.body || "{}");
    const { destination, duration, companion, extras = [], themes = [], dateType, dateStart, dateEnd } = body;

    if (!destination) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: '여행지가 없습니다.' }) };
    }

    const themeStr = themes.length > 0 ? themes.join(', ') : '자유 여행';
    const extrasStr = extras.length > 0 ? extras.join(', ') : '없음';
    const dateStr = dateType === '미정' ? '미정' : `${dateStart || ''} ~ ${dateEnd || ''}`;
    const nokids = extras.includes('노키즈존 제외');

    const prompt = `당신은 친절한 여행 플래너입니다.

아래 여행 정보를 바탕으로 일정을 만들어야 합니다.
실제로 존재하는 장소명(식당, 카페, 관광지, 거리, 미술관, 시장 등)을 중심으로 일정을 작성하세요.
절대로 가상의 장소명이나 "○○맛집", "○○카페", "대표 관광지", "관광안내소" 같은 일반명사를 place 필드에 사용하지 마세요.

여행 정보:
- 여행지: ${destination}
- 기간: ${duration}
- 동행: ${companion || '미정'}${extrasStr !== '없음' ? ` (${extrasStr})` : ''}
- 테마: ${themeStr}
- 날짜: ${dateStr}
${nokids ? '- 노키즈존은 반드시 제외, 아이 입장 가능한 곳만 추천' : ''}

작성 규칙:
1. place 필드에는 실제 장소명/상호명만 작성하세요.
2. desc, theme, area에는 "감성 카페", "로컬 맛집", "인기 식당" 같은 표현을 써도 됩니다.
3. Day 1, Day 2를 작성하세요.
4. 각 Day는 오전/오후/저녁 3개 슬롯으로 작성하세요.
5. 검색 기능은 없으므로, 널리 알려진 실제 장소 위주로 안전하게 추천하세요.
6. JSON 외 텍스트, 마크다운, 설명 문구 없이 JSON만 반환하세요.

최종 답변 형식:
{
  "intro": "이 여행을 한 문장으로 감성적으로 표현",
  "days": [
    {
      "day": "Day 1",
      "area": "지역명",
      "theme": "이날의 테마 키워드",
      "slots": [
        { "time": "오전", "emoji": "☀️", "place": "실제 장소명", "desc": "장소 설명 1~2줄", "tag": "카테고리" },
        { "time": "오후", "emoji": "🏛️", "place": "실제 장소명", "desc": "장소 설명 1~2줄", "tag": "카테고리" },
        { "time": "저녁", "emoji": "🍜", "place": "실제 장소명", "desc": "장소 설명 1~2줄", "tag": "카테고리" }
      ]
    },
    {
      "day": "Day 2",
      "area": "지역명",
      "theme": "이날의 테마 키워드",
      "slots": [
        { "time": "오전", "emoji": "☕", "place": "실제 장소명", "desc": "장소 설명 1~2줄", "tag": "카테고리" },
        { "time": "오후", "emoji": "🌿", "place": "실제 장소명", "desc": "장소 설명 1~2줄", "tag": "카테고리" },
        { "time": "저녁", "emoji": "🍣", "place": "실제 장소명", "desc": "장소 설명 1~2줄", "tag": "카테고리" }
      ]
    }
  ]
}`;

    const apiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.65,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Return valid JSON only. No markdown, no code blocks, no preamble. Use specific real place names in the place field.' },
          { role: 'user', content: prompt }
        ]
      })
    });

    const raw = await apiRes.text();
    if (!apiRes.ok) throw new Error(`OpenAI API 오류: ${raw}`);

    const parsed = JSON.parse(raw);
    const content = parsed.choices?.[0]?.message?.content || "";
    const plan = extractJson(content);

    if (!isValidPlan(plan)) {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: '일정 형식이 올바르지 않습니다.' }) };
    }

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }) };

  } catch (err) {
    console.error('generate-plan error:', err);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: err.message || '서버 오류' }) };
  }
};
