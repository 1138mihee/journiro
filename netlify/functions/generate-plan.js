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
    const banned = [
      "장소 정보를 다시 생성해주세요",
      "다시 생성",
      "관광안내소",
      "대표 관광지",
      "대표 명소",
      "감성 카페",
      "브런치 카페",
      "로컬 맛집",
      "맛집 거리",
      "인기 식당",
      "카페거리",
      "전통시장",
      "중앙시장",
      "쇼핑거리",
      "편집숍 거리",

      // 음식명/카테고리만 place에 들어오는 경우 차단
      "고기국수",
      "흑돼지",
      "해산물",
      "갈치조림",
      "전복죽",
      "돔베고기",
      "라멘",
      "스시",
      "우동",
      "타코야키",
      "오코노미야키",
      "브런치",
      "카페",
      "맛집",
      "식당",
      "레스토랑"
    ];

    const places = (plan?.days || [])
      .flatMap(d => d.slots || [])
      .map(s => (s.place || "").trim());

    return places.some(place => {
      if (!place) return true;

      // 완전히 음식명/카테고리만 있는 경우 차단
      if (banned.includes(place)) return true;

      // "제주 고기국수", "이태원 브런치 카페"처럼 지역명 + 카테고리만 있는 경우 차단
      const genericPattern = /^[가-힣A-Za-z0-9\s·&'’.-]+(고기국수|흑돼지|해산물|갈치조림|전복죽|돔베고기|브런치 카페|감성 카페|로컬 맛집|인기 식당|대표 명소|맛집 거리|카페거리|카페 거리|쇼핑거리|쇼핑 거리|전통시장|중앙시장|식당|레스토랑)$/;
      if (genericPattern.test(place)) return true;

      // place가 금지어를 포함하되, 실제 상호로 보기 어려운 짧은 표현이면 차단
      if (place.length <= 8 && banned.some(word => place.includes(word))) return true;

      return false;
    });
  }

  function isValidPlan(plan) {
    if (!plan || !plan.intro || !Array.isArray(plan.days) || plan.days.length < 1) return false;

    let validSlotCount = 0;
    for (const day of plan.days) {
      if (!day.day || !Array.isArray(day.slots)) continue;
      for (const slot of day.slots) {
        if (slot.time && slot.place && slot.place.length >= 2 && slot.desc && slot.tag) {
          validSlotCount++;
        }
      }
    }

    return validSlotCount >= 3 && !hasHardInvalidText(plan);
  }

  async function callOpenAI({ destination, duration, companion, extras, themes, dateType, dateStart, dateEnd, retry = false }) {
    const themeStr = themes.length > 0 ? themes.join(', ') : '자유 여행';
    const extrasStr = extras.length > 0 ? extras.join(', ') : '없음';
    const dateStr = dateType === '미정' ? '미정' : `${dateStart || ''} ~ ${dateEnd || ''}`;
    const nokids = extras.includes('노키즈존 제외');

    const prompt = `당신은 친절한 여행 플래너입니다.

아래 여행 정보를 바탕으로 일정을 만들어야 합니다.
실제로 존재하는 장소명(식당, 카페, 관광지, 거리, 미술관, 시장 등)을 중심으로 일정을 작성하세요.

중요:
place 필드는 반드시 실제 상호명/장소명이어야 합니다.
음식명이나 카테고리명만 쓰면 안 됩니다.

나쁜 예:
- "고기국수"
- "제주 고기국수"
- "흑돼지"
- "이태원 브런치 카페"
- "로컬 맛집"
- "감성 카페"
- "대표 명소"

좋은 예:
- "자매국수"
- "올래국수"
- "국수마당"
- "돈사돈 본관"
- "리움미술관"
- "챔프커피 제2작업실"
- "이치란 라멘 신주쿠점"

여행 정보:
- 여행지: ${destination}
- 기간: ${duration}
- 동행: ${companion || '미정'}${extrasStr !== '없음' ? ` (${extrasStr})` : ''}
- 테마: ${themeStr}
- 날짜: ${dateStr}
${nokids ? '- 노키즈존은 반드시 제외, 아이 입장 가능한 곳만 추천' : ''}

작성 규칙:
1. place 필드에는 실제 장소명/상호명만 작성하세요.
2. 제주에서 고기국수를 추천할 경우 place는 "자매국수", "올래국수", "국수마당"처럼 실제 식당명이어야 합니다.
3. desc에는 "고기국수 맛집", "감성 카페" 같은 설명 표현을 써도 됩니다.
4. Day 1, Day 2를 작성하세요.
5. 각 Day는 오전/오후/저녁 3개 슬롯으로 작성하세요.
6. 검색 기능은 없으므로, 널리 알려진 실제 장소 위주로 안전하게 추천하세요.
7. JSON 외 텍스트, 마크다운, 설명 문구 없이 JSON만 반환하세요.
${retry ? '8. 이전 응답에 음식명/카테고리명이 place에 들어갔습니다. 이번에는 place에 반드시 실제 상호명만 넣으세요.' : ''}

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
        temperature: retry ? 0.35 : 0.65,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Return valid JSON only. In the place field, use only specific real venue/place/business names. Never use food names or category names as place.'
          },
          { role: 'user', content: prompt }
        ]
      })
    });

    const raw = await apiRes.text();
    if (!apiRes.ok) throw new Error(`OpenAI API 오류: ${raw}`);

    const parsed = JSON.parse(raw);
    const content = parsed.choices?.[0]?.message?.content || "";
    return extractJson(content);
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

    let plan = await callOpenAI({ destination, duration, companion, extras, themes, dateType, dateStart, dateEnd, retry: false });

    if (!isValidPlan(plan)) {
      plan = await callOpenAI({ destination, duration, companion, extras, themes, dateType, dateStart, dateEnd, retry: true });
    }

    if (!isValidPlan(plan)) {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: '실제 상호명 생성에 실패했습니다.' }) };
    }

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }) };

  } catch (err) {
    console.error('generate-plan error:', err);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: err.message || '서버 오류' }) };
  }
};
