exports.handler = async function(event) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'OPENAI_API_KEY가 설정되지 않았습니다.' }) };

  function extractJson(text) {
    const cleaned = (text || '').replace(/```json|```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end >= 0) return JSON.parse(cleaned.slice(start, end + 1));
    return JSON.parse(cleaned || '{}');
  }

  function getBaseUrl(event) {
    const proto = event.headers['x-forwarded-proto'] || 'https';
    return `${proto}://${event.headers.host}`;
  }

  function normalizeDestination(destination = '') {
    if (destination.includes('제주')) return '제주';
    if (destination.includes('서울')) return '서울';
    if (destination.includes('부산')) return '부산';
    if (destination.includes('도쿄')) return '도쿄';
    if (destination.includes('오사카')) return '오사카';
    if (destination.includes('후쿠오카')) return '후쿠오카';
    if (destination.includes('다낭')) return '다낭';
    if (destination.includes('방콕') || destination.toLowerCase().includes('bangkok')) return '방콕';
    return destination;
  }

  function getTotalDays(duration) {
    return { '당일치기': 1, '1박 2일': 2, '2박 3일': 3, '3박 4일': 4, '4박 5일': 5, '일주일 이상': 7 }[duration] || 2;
  }

  function getSlots(duration) {
    return duration === '당일치기' ? ['오전', '오후'] : ['오전', '오후', '저녁'];
  }

  function buildQueryByTheme(city, theme) {
    const map = {
      '맛집': `${city} 맛집`,
      '카페': `${city} 카페`,
      '쇼핑': `${city} 쇼핑`,
      '자연': `${city} 자연 명소`,
      '문화·역사': `${city} 명소`,
      '액티비티': `${city} 액티비티`,
      '힐링·휴식': `${city} 힐링 카페`
    };
    return map[theme] || `${city} 맛집`;
  }

  async function fetchPlacePool(event, city, query, display = 10) {
    const url =
      `${getBaseUrl(event)}/.netlify/functions/build-place-pool` +
      `?city=${encodeURIComponent(city)}` +
      `&query=${encodeURIComponent(query)}` +
      `&display=${encodeURIComponent(display)}`;

    const res = await fetch(url);
    const raw = await res.text();
    if (!res.ok) {
      console.warn('build-place-pool failed:', raw);
      return { places: [] };
    }
    return JSON.parse(raw);
  }

  async function collectPlaceCandidates(event, city, themes = []) {
    const selectedThemes = themes.length ? themes : ['맛집', '카페', '문화·역사'];
    const queries = selectedThemes.slice(0, 3).map(theme => buildQueryByTheme(city, theme));

    if (!queries.some(q => q.includes('맛집'))) queries.push(`${city} 맛집`);
    if (!queries.some(q => q.includes('카페'))) queries.push(`${city} 카페`);

    const places = [];
    const seen = new Set();

    for (const query of queries.slice(0, 5)) {
      const pool = await fetchPlacePool(event, city, query, 10);
      for (const place of pool.places || []) {
        if (!place.name) continue;
        const key = place.name.replace(/\s+/g, '').toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        places.push({
          name: place.name,
          category: place.category || '기타',
          reason: place.reason || '',
          source: place.source || 'naver_review',
          status: place.status || ''
        });
      }
    }

    return places.slice(0, 45);
  }

  function buildFallbackPlaces(city) {
    const data = {
      '도쿄': [
        ['Fuglen Tokyo','카페'], ['다이칸야마 T-Site','쇼핑'], ['시부야 스카이','명소'], ['메이지 신궁','명소'],
        ['이치란 라멘 신주쿠점','맛집'], ['츠키지 장외시장','맛집'], ['아사쿠사 센소지','명소'], ['도쿄국립박물관','명소']
      ],
      '오사카': [
        ['도톤보리 글리코사인','명소'], ['신사이바시스지 상점가','쇼핑'], ['쿠시카츠 다루마 신세카이 본점','맛집'],
        ['오사카성','명소'], ['구로몬시장','맛집'], ['우메다 스카이빌딩 공중정원','명소']
      ],
      '후쿠오카': [
        ['캐널시티 하카타','쇼핑'], ['오호리공원','자연'], ['텐진 지하상가','쇼핑'], ['이치란 본사 총본점','맛집'],
        ['멘타이쥬','맛집'], ['다자이후 텐만구','명소']
      ],
      '제주': [
        ['자매국수','맛집'], ['올래국수','맛집'], ['돈사돈 본관','맛집'], ['명진전복','맛집'],
        ['협재해수욕장','자연'], ['오설록 티뮤지엄','카페'], ['스누피가든','명소']
      ],
      '다낭': [
        ['미케비치','자연'], ['한시장','쇼핑'], ['콩카페 다낭','카페'], ['바나힐','명소'], ['마담란','맛집'], ['목식당','맛집']
      ],
      '방콕': [
        ['The Grand Palace','명소'], ['Wat Arun','명소'], ['Wat Pho','명소'], ['ICONSIAM','쇼핑'],
        ['Jeh O Chula','맛집'], ['Thipsamai Pad Thai Pratu Phi','맛집'], ['After You Dessert Cafe Siam Paragon','카페']
      ],
      '부산': [
        ['해운대해수욕장','자연'], ['동백섬','자연'], ['해운대암소갈비집','맛집'], ['흰여울문화마을','명소'],
        ['국제시장','쇼핑'], ['이재모피자','맛집']
      ],
      '서울': [
        ['북촌한옥마을','명소'], ['리움미술관','명소'], ['카페 레이어드 안국점','카페'], ['광장시장','맛집'],
        ['국립현대미술관 서울','명소'], ['서울숲','자연']
      ]
    };
    return (data[city] || []).map(([name, category]) => ({ name, category, status: 'fallback_seed', source: 'fallback' }));
  }

  function formatCandidateList(places) {
    return places.map((p, i) => `${i + 1}. ${p.name} / ${p.category || '기타'} / ${p.reason || '후기 기반 후보'}`).join('\n');
  }

  function buildCompanionInstructions(companion, extras = []) {
    const lines = [];
    if (companion === '혼자') lines.push('- 혼자 가도 부담 없는 카페, 서점, 공원, 시장 위주로 구성하세요.');
    if (companion === '연인') lines.push('- 저녁에는 분위기 있는 식당, 야경, 산책 코스를 우선 배치하세요.');
    if (companion === '친구') lines.push('- 맛집, 시장, 쇼핑, 사진 찍기 좋은 장소를 적극 포함하세요.');
    if (companion === '가족') lines.push('- 이동 거리가 짧고 접근성이 좋은 동선으로 구성하세요.');
    if (extras.includes('노약자 동반')) lines.push('- 노약자 동반이므로 계단이 많거나 오래 걷는 코스는 피하세요.');
    if (extras.includes('어린 아이 동반')) lines.push('- 아이 동반이므로 과도한 웨이팅 장소는 피하고 실내 휴식 장소를 포함하세요.');
    if (extras.includes('노키즈존 제외')) lines.push('- 노키즈존 가능성이 있는 장소는 피하세요.');
    return lines.join('\n');
  }

  function isValidPlan(plan, totalDays, slots) {
    if (!plan || !plan.intro || !Array.isArray(plan.days)) return false;
    if (plan.days.length !== totalDays) return false;
    const allowedSlots = new Set(slots);
    for (const day of plan.days) {
      if (!day.day || !day.area || !Array.isArray(day.slots)) return false;
      if (day.slots.length !== slots.length) return false;
      for (const slot of day.slots) {
        if (!allowedSlots.has(slot.time)) return false;
        if (!slot.place || slot.place.trim().length < 2 || !slot.desc || !slot.tag) return false;
      }
    }
    return true;
  }

  function hasInvalidPlace(plan, candidateNames) {
    const allowed = new Set(candidateNames.map(name => name.replace(/\s+/g, '').toLowerCase()));
    const generic = ['맛집','식당','카페','레스토랑','음식점','호텔','숙소','고기국수','흑돼지','팟타이','라멘','스시','대표 명소','감성 카페','로컬 맛집','인기 식당','짬뽕집','짬뽕'];
    return (plan?.days || []).flatMap(d => d.slots || []).some(slot => {
      const place = (slot.place || '').trim();
      const key = place.replace(/\s+/g, '').toLowerCase();
      return !place || place.length < 2 || generic.includes(place) || !allowed.has(key);
    });
  }

  async function callOpenAI({ destination, duration, companion, extras, themes, dateType, dateStart, dateEnd, places, retry = false }) {
    const totalDays = getTotalDays(duration);
    const slots = getSlots(duration);
    const dateStr = dateType === '미정' ? '미정' : `${dateStart || ''} ~ ${dateEnd || ''}`;
    const themeStr = themes.length ? themes.join(', ') : '자유 여행';
    const candidateList = formatCandidateList(places);

    const slotRule = duration === '당일치기'
      ? 'days 배열은 정확히 1개, slots는 오전·오후 2개만 작성하세요. 저녁 슬롯은 절대 포함하지 마세요.'
      : `days 배열은 정확히 ${totalDays}개, 각 day의 slots는 오전·오후·저녁 3개로 작성하세요.`;

    const prompt = `당신은 ${destination} 전문 여행 플래너입니다.

[가장 중요한 규칙]
아래 [사용 가능한 실제 장소 후보] 목록 안에 있는 place만 사용해서 일정을 만드세요.
후보 목록에 없는 장소명은 절대 새로 만들지 마세요.
place 필드는 후보 목록의 장소명을 글자 그대로 사용하세요.

[사용 가능한 실제 장소 후보]
${candidateList}

[여행 정보]
- 여행지: ${destination}
- 기간: ${duration}
- 총 일수: ${totalDays}일
- 동행: ${companion || '미정'}
- 추가 조건: ${(extras || []).join(', ') || '없음'}
- 테마: ${themeStr}
- 날짜: ${dateStr}

[동행/조건 반영]
${buildCompanionInstructions(companion, extras) || '- 선택 조건에 맞춰 이동 피로도가 낮고 만족도 높은 동선을 구성하세요.'}

[일정 규칙]
1. ${slotRule}
2. 각 Day는 가능한 한 인접한 권역으로 묶어 area에 동네/권역명을 적으세요.
3. desc는 2문장 이상 작성하세요.
4. tag는 맛집, 카페, 명소, 쇼핑, 자연, 숙소, 기타 중 하나에 가깝게 작성하세요.
5. JSON 외 텍스트는 절대 포함하지 마세요.
${retry ? '6. 재시도입니다. 반드시 후보 목록 안의 place만 사용하세요.' : ''}

반환 형식:
{
  "intro": "${destination} 여행을 한 문장으로 감성적으로 표현",
  "days": [
    {
      "day": "Day 1",
      "area": "권역명",
      "theme": "이날의 테마",
      "slots": [
        { "time": "오전", "emoji": "☕", "place": "후보 목록의 장소명 그대로", "desc": "장소 설명 2문장 이상", "tag": "카테고리" }
      ]
    }
  ]
}`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: retry ? 0.2 : 0.45,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Return valid JSON only. Only use places from the provided candidate list. Never invent place names.' },
          { role: 'user', content: prompt }
        ]
      })
    });

    const raw = await res.text();
    if (!res.ok) throw new Error(`OpenAI API 오류: ${raw}`);
    const parsed = JSON.parse(raw);
    return extractJson(parsed.choices?.[0]?.message?.content || '{}');
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { destination, duration, companion, extras = [], themes = [], dateType = '미정', dateStart = '', dateEnd = '' } = body;

    if (!destination) return { statusCode: 400, headers, body: JSON.stringify({ error: '여행지가 없습니다.' }) };

    const city = normalizeDestination(destination);
    const totalDays = getTotalDays(duration);
    const slots = getSlots(duration);

    let places = await collectPlaceCandidates(event, city, themes);

    if (places.length < Math.max(6, totalDays * slots.length)) {
      const seen = new Set(places.map(p => p.name.replace(/\s+/g, '').toLowerCase()));
      for (const p of buildFallbackPlaces(city)) {
        const key = p.name.replace(/\s+/g, '').toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          places.push(p);
        }
      }
    }

    if (places.length < totalDays * slots.length) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: '일정 생성에 필요한 실제 장소 후보가 부족합니다.', placeCount: places.length }) };
    }

    let plan = await callOpenAI({ destination, duration, companion, extras, themes, dateType, dateStart, dateEnd, places, retry: false });
    const candidateNames = places.map(p => p.name);

    if (!isValidPlan(plan, totalDays, slots) || hasInvalidPlace(plan, candidateNames)) {
      plan = await callOpenAI({ destination, duration, companion, extras, themes, dateType, dateStart, dateEnd, places, retry: true });
    }

    if (!isValidPlan(plan, totalDays, slots) || hasInvalidPlace(plan, candidateNames)) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: '후보 장소 기반 일정 생성에 실패했습니다. 다시 시도해 주세요.', placeCandidates: candidateNames }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ plan, duration, totalDays, placeCandidates: places })
    };
  } catch (err) {
    console.error('generate-plan error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || '서버 오류가 발생했습니다.' }) };
  }
};
