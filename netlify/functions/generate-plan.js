exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  function extractJson(text) {
    if (!text) return null;
    const cleaned = text.replace(/```json|```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end >= 0) return JSON.parse(cleaned.slice(start, end + 1));
    return JSON.parse(cleaned);
  }

  function normalizeDestination(destination = '') {
    if (destination.includes('제주')) return '제주';
    if (destination.includes('서울')) return '서울';
    if (destination.includes('부산')) return '부산';
    if (destination.includes('도쿄')) return '도쿄';
    if (destination.includes('오사카')) return '오사카';
    return destination;
  }

  function getSeedPlaces(destination = '') {
    const dest = normalizeDestination(destination);
    const seedMap = {
      '제주': [
        '자매국수', '올래국수', '국수마당', '돈사돈 본관', '명진전복',
        '성산일출봉', '비자림', '협재해수욕장', '카페 노티드 제주 애월', '오설록 티뮤지엄',
        '동문재래시장', '스누피가든', '아르떼뮤지엄 제주'
      ],
      '서울': [
        '리움미술관', '오월의종 한남점', '챔프커피 제2작업실', '북촌한옥마을',
        '카페 레이어드 안국점', '광장시장', '서울숲', '난포 성수', '성수동 대림창고'
      ],
      '부산': [
        '해운대해수욕장', '달맞이길', '해운대암소갈비집', '흰여울문화마을',
        '국제시장', 'BIFF광장', '감천문화마을', '광안리해수욕장', '초량밀면'
      ],
      '도쿄': [
        'Fuglen Tokyo', '다이칸야마 T-Site', '시부야 스카이', '메이지 신궁',
        '캣스트리트', '이치란 라멘 신주쿠점', '츠키지 장외시장', '아사쿠사 센소지'
      ],
      '오사카': [
        '신사이바시스지 상점가', '도톤보리 글리코사인', '쿠시카츠 다루마 신세카이 본점',
        '우메다 스카이빌딩 공중정원', '나카자키초', '이치란 라멘 도톤보리점',
        '오사카성', '구로몬시장'
      ]
    };
    return seedMap[dest] || [];
  }

  function isValidPlan(plan) {
    if (!plan || !plan.intro || !Array.isArray(plan.days) || plan.days.length < 1) return false;

    let validSlotCount = 0;
    for (const day of plan.days) {
      if (!day.day || !Array.isArray(day.slots)) continue;
      for (const slot of day.slots) {
        if (slot.time && slot.place && slot.place.trim().length >= 2 && slot.desc && slot.tag) {
          validSlotCount++;
        }
      }
    }
    return validSlotCount >= 3;
  }

  function hasBadPlaceName(plan) {
    const exactBanned = [
      '○○', 'XX', '장소명', '실제 장소', '장소 정보를 다시 생성해주세요',
      '다시 생성', '장소 정보', '관광안내소', '근처 카페', '근처 식당', '인근',
      '현지 추천 장소'
    ];

    // 완전히 이것만 place로 나오면 안 되는 단어들
    const categoryOnly = [
      '맛집', '식당', '카페', '레스토랑', '음식점', '호텔', '숙소', '펜션',
      '고기국수', '흑돼지', '갈치조림', '전복죽', '해산물', '돔베고기',
      '브런치', '라멘', '스시', '우동', '타코야키', '오코노미야키',
      '대표 명소', '대표 관광지', '감성 카페', '브런치 카페', '로컬 맛집', '인기 식당'
    ];

    const genericPattern = /^[가-힣A-Za-z0-9\s·&'’.-]+(맛집|식당|카페|레스토랑|음식점|고기국수|흑돼지|갈치조림|전복죽|해산물|돔베고기|브런치 카페|감성 카페|로컬 맛집|인기 식당|대표 명소|대표 관광지)$/;

    const allPlaces = (plan?.days || [])
      .flatMap(d => d.slots || [])
      .map(s => (s.place || '').trim());

    return allPlaces.some(place => {
      if (!place || place.length < 2) return true;
      if (exactBanned.some(word => place.includes(word))) return true;
      if (categoryOnly.includes(place)) return true;
      if (genericPattern.test(place)) return true;
      return false;
    });
  }

  function hasWrongRegion(plan, destination) {
    const destRegion = normalizeDestination(destination);
    const regionKeywords = {
      '서울': ['한남', '이태원', '홍대', '강남', '종로', '명동', '신촌', '합정', '성수', '마포', '용산', '광화문', '안국', '북촌'],
      '제주': ['제주', '한라', '성산', '협재', '애월', '서귀포', '중문', '우도', '비자림', '함덕', '월정', '동문', '오설록'],
      '부산': ['부산', '해운대', '광안리', '남포', '서면', '기장', '송정', '감천', '영도', '초량'],
      '도쿄': ['도쿄', '시부야', '신주쿠', '아사쿠사', '하라주쿠', '아키하바라', '긴자', '우에노', '롯폰기', '다이칸야마'],
      '오사카': ['오사카', '도톤보리', '난바', '신사이바시', '우메다', '덴노지', '신세카이', '나카자키초'],
    };

    if (!regionKeywords[destRegion]) return false;

    const allPlaces = (plan?.days || [])
      .flatMap(d => d.slots || [])
      .map(s => s.place || '')
      .join(' ');

    for (const [region, keywords] of Object.entries(regionKeywords)) {
      if (region === destRegion) continue;
      if (keywords.some(kw => allPlaces.includes(kw))) return true;
    }
    return false;
  }

  async function callOpenAI(params) {
    const { destination, duration, companion, extras, themes, dateType, dateStart, dateEnd, retry = false } = params;

    const themeStr = themes.length > 0 ? themes.join(', ') : '자유 여행';
    const extrasStr = extras.length > 0 ? extras.join(', ') : '없음';
    const dateStr = dateType === '미정' ? '미정' : `${dateStart || ''} ~ ${dateEnd || ''}`;
    const nokids = extras.includes('노키즈존 제외');
    const hasElder = extras.includes('노약자 동반');
    const hasChild = extras.includes('어린 아이 동반');
    const seedPlaces = getSeedPlaces(destination);

    const companionContext = [
      companion === '연인' ? '연인과 함께하는 로맨틱한 여행으로 구성하세요.' : '',
      companion === '친구' ? '친구들과 활기차고 즐거운 여행으로 구성하세요.' : '',
      companion === '가족' ? '가족 모두가 즐길 수 있는 여행으로 구성하세요.' : '',
      companion === '혼자' ? '혼자만의 자유롭고 여유로운 여행으로 구성하세요.' : '',
      hasElder ? '노약자가 동반하므로 이동 거리가 짧고 접근성이 좋은 장소 위주로 구성하세요.' : '',
      hasChild ? '어린 아이가 동반하므로 아이 친화적인 장소 위주로 구성하세요.' : '',
      nokids ? '카페, 식당 모두 노키즈존 가능성이 있는 곳은 피하고 아이 입장 가능한 장소 위주로 추천하세요.' : '',
    ].filter(Boolean).join(' ');

    const themeContext = themes.length > 0
      ? `테마(${themeStr})에 맞는 장소를 우선 배치하세요. 맛집 테마면 실제 식당 상호명, 카페 테마면 실제 카페 상호명, 문화 테마면 실제 박물관/미술관/역사 명소명을 사용하세요.`
      : '';

    const dateContext = dateType !== '미정' && dateStart
      ? `여행 날짜(${dateStr})에 맞는 계절 특성, 현지 행사, 날씨 등을 반영하세요.`
      : '';

    const prompt = `당신은 ${destination} 전문 여행 플래너입니다.

[매우 중요]
1. 모든 place 필드는 반드시 "${destination}" 지역 안에 실제로 존재하는 상호명/장소명이어야 합니다.
2. 다른 도시나 지역의 장소는 절대 포함하지 마세요.
3. "고기국수", "흑돼지", "브런치 카페", "맛집", "식당", "카페" 같은 음식명/카테고리명만 place에 쓰면 안 됩니다.
4. place에는 음식명이 아니라 실제 식당명/카페명/명소명을 써야 합니다.
5. 예를 들어 제주도에서 고기국수를 추천한다면 place는 "자매국수", "올래국수", "국수마당"처럼 실제 식당명이어야 합니다.
6. 정확한 상호명이 불확실하면 아래 참고 장소 중에서 선택하거나, 널리 알려진 실제 명소/거리/시장 이름을 사용하세요.

참고 가능한 실제 장소 후보:
${seedPlaces.length ? seedPlaces.map(p => `- ${p}`).join('\n') : '- 해당 도시의 널리 알려진 실제 명소, 시장, 거리, 미술관, 식당 상호명'}

여행 정보:
- 여행지: ${destination}
- 기간: ${duration}
- 동행: ${companion || '미정'}${extrasStr !== '없음' ? ` (${extrasStr})` : ''}
- 테마: ${themeStr}
- 날짜: ${dateStr}

동행 조건: ${companionContext}
테마 조건: ${themeContext}
날짜 조건: ${dateContext}

${retry ? '[재시도] 이전 응답에 지역 불일치 또는 카테고리명이 있었습니다. place를 반드시 실제 상호명/장소명으로 교체하세요.' : ''}

반환 형식(JSON만):
{
  "intro": "${destination} 여행을 한 문장으로 감성적으로 표현",
  "days": [
    {
      "day": "Day 1",
      "area": "${destination} 내 세부 지역명",
      "theme": "이날의 테마 키워드",
      "slots": [
        { "time": "오전", "emoji": "☀️", "place": "${destination} 실제 장소명", "desc": "장소 설명 1~2줄", "tag": "카테고리" },
        { "time": "오후", "emoji": "🏛️", "place": "${destination} 실제 장소명", "desc": "장소 설명 1~2줄", "tag": "카테고리" },
        { "time": "저녁", "emoji": "🍜", "place": "${destination} 실제 장소명", "desc": "장소 설명 1~2줄", "tag": "카테고리" }
      ]
    },
    {
      "day": "Day 2",
      "area": "${destination} 내 세부 지역명",
      "theme": "이날의 테마 키워드",
      "slots": [
        { "time": "오전", "emoji": "☕", "place": "${destination} 실제 장소명", "desc": "장소 설명 1~2줄", "tag": "카테고리" },
        { "time": "오후", "emoji": "🌿", "place": "${destination} 실제 장소명", "desc": "장소 설명 1~2줄", "tag": "카테고리" },
        { "time": "저녁", "emoji": "🍣", "place": "${destination} 실제 장소명", "desc": "장소 설명 1~2줄", "tag": "카테고리" }
      ]
    }
  ]
}`;

    const apiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: retry ? 0.25 : 0.55,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a travel planner specializing in ${destination}. Return valid JSON only. CRITICAL: every place must be a real venue/place in ${destination}. Never use generic food/category names as place. Never include places from other cities.`
          },
          { role: 'user', content: prompt }
        ]
      })
    });

    const raw = await apiRes.text();
    if (!apiRes.ok) throw new Error(`OpenAI API 오류: ${raw}`);

    const parsed = JSON.parse(raw);
    const content = parsed.choices?.[0]?.message?.content || '';
    return extractJson(content);
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'OPENAI_API_KEY가 없습니다.' })
      };
    }

    const body = JSON.parse(event.body || '{}');
    const { destination, duration, companion, extras = [], themes = [], dateType, dateStart, dateEnd } = body;

    if (!destination) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: '여행지가 없습니다.' })
      };
    }

    let plan = await callOpenAI({ destination, duration, companion, extras, themes, dateType, dateStart, dateEnd, retry: false });

    const needsRetry = !isValidPlan(plan) || hasBadPlaceName(plan) || hasWrongRegion(plan, destination);
    if (needsRetry) {
      plan = await callOpenAI({ destination, duration, companion, extras, themes, dateType, dateStart, dateEnd, retry: true });
    }

    if (!isValidPlan(plan) || hasBadPlaceName(plan) || hasWrongRegion(plan, destination)) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: '실제 장소명 생성에 실패했습니다.' })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan })
    };

  } catch (err) {
    console.error('generate-plan error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message || '서버 오류' })
    };
  }
};
