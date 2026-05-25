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
    if (destination.includes('방콕') || destination.toLowerCase().includes('bangkok')) return '방콕';
    return destination;
  }

  function getTotalDays(duration) {
    const map = { '당일치기': 1, '1박 2일': 2, '2박 3일': 3, '3박 4일': 4, '4박 5일': 5, '일주일 이상': 7 };
    return map[duration] || 2;
  }

  function getSlots(duration) {
    if (duration === '당일치기') return ['오전', '오후'];
    return ['오전', '오후', '저녁'];
  }

  const cityData = {
    '제주': {
      seed: ['자매국수','올래국수','국수마당','돈사돈 본관','명진전복','성산일출봉','비자림','협재해수욕장','카페 노티드 제주 애월','오설록 티뮤지엄','동문재래시장','스누피가든','아르떼뮤지엄 제주','함덕해수욕장','월정리해변'],
      allowed: ['제주','한라','성산','협재','애월','서귀포','중문','우도','비자림','함덕','월정','동문','오설록','자매국수','올래국수','돈사돈','명진전복','스누피가든','아르떼뮤지엄'],
      blocked: ['부산','해운대','광안리','서울','한남','이태원','성수','방콕','시암','짜뚜짝','도쿄','신주쿠','오사카','도톤보리']
    },
    '부산': {
      seed: ['해운대해수욕장','동백섬','해운대암소갈비집','흰여울문화마을','국제시장','BIFF광장','이재모피자','초량밀면','자갈치시장','감천문화마을','광안리해수욕장','부산현대미술관','신세계백화점 센텀시티'],
      allowed: ['부산','해운대','동백섬','광안리','남포','서면','기장','송정','감천','영도','초량','자갈치','센텀','국제시장','BIFF','이재모','암소갈비','흰여울'],
      blocked: ['제주','애월','협재','서울','한남','이태원','성수','방콕','시암','짜뚜짝','도쿄','신주쿠','오사카','도톤보리']
    },
    '서울': {
      seed: ['북촌한옥마을','리움미술관','카페 레이어드 안국점','광장시장','국립현대미술관 서울','서울숲','난포 성수','오월의종 한남점','덕수궁','남산서울타워'],
      allowed: ['서울','한남','이태원','성수','안국','북촌','종로','광화문','마포','홍대','명동','인사동','광장시장','리움','남산','덕수궁'],
      blocked: ['제주','애월','협재','부산','해운대','광안리','방콕','시암','짜뚜짝','도쿄','신주쿠','오사카','도톤보리']
    },
    '도쿄': {
      seed: ['Fuglen Tokyo','다이칸야마 T-Site','시부야 스카이','메이지 신궁','캣스트리트','이치란 라멘 신주쿠점','츠키지 장외시장','아사쿠사 센소지','도쿄국립박물관'],
      allowed: ['도쿄','시부야','신주쿠','아사쿠사','하라주쿠','아키하바라','긴자','우에노','롯폰기','다이칸야마','츠키지','센소지','메이지'],
      blocked: ['제주','부산','해운대','서울','한남','이태원','방콕','시암','짜뚜짝','오사카','도톤보리']
    },
    '오사카': {
      seed: ['신사이바시스지 상점가','도톤보리 글리코사인','쿠시카츠 다루마 신세카이 본점','우메다 스카이빌딩 공중정원','나카자키초','이치란 라멘 도톤보리점','오사카성','구로몬시장'],
      allowed: ['오사카','도톤보리','난바','신사이바시','우메다','덴노지','신세카이','나카자키초','구로몬','오사카성'],
      blocked: ['제주','부산','해운대','서울','한남','이태원','방콕','시암','짜뚜짝','도쿄','신주쿠']
    },
    '방콕': {
      seed: ['The Grand Palace','Wat Arun','Wat Pho','ICONSIAM','Chatuchak Weekend Market','JODD FAIRS Rama 9','Jeh O Chula','Thipsamai Pad Thai Pratu Phi','Raan Jay Fai','After You Dessert Cafe Siam Paragon','The Commons Thonglor','Siam Paragon','Jim Thompson House Museum','Lumpini Park','Terminal 21 Asok'],
      allowed: ['방콕','Bangkok','Siam','시암','Thonglor','통로','Asok','아속','Rama','Chatuchak','짜뚜짝','ICONSIAM','아이콘시암','Wat','왕궁','왓','카오산','Chula','쭐라','JODD','Terminal 21','Lumpini','룸피니','Jim Thompson','Grand Palace','Jay Fai','Jeh O','Thipsamai','After You'],
      blocked: ['제주','애월','협재','부산','해운대','광안리','서울','한남','이태원','성수','도쿄','신주쿠','오사카','도톤보리','짬뽕','고기국수','흑돼지','밀면']
    }
  };

  function getCityInfo(destination) {
    return cityData[normalizeDestination(destination)] || null;
  }

  function buildDaysTemplate(destination, totalDays, slots) {
    const emojis = { '오전': '☀️', '오후': '🏛️', '저녁': '🍜' };
    const days = Array.from({ length: totalDays }, (_, i) => ({
      day: `Day ${i + 1}`,
      area: `${destination} 내 세부 지역명`,
      theme: '이날의 테마 키워드',
      slots: slots.map(time => ({ time, emoji: emojis[time] || '📍', place: `${destination} 실제 장소명`, desc: '장소 설명 1~2줄', tag: '카테고리' }))
    }));
    return JSON.stringify(days, null, 2);
  }

  function isValidPlan(plan, totalDays, slots) {
    if (!plan || !plan.intro || !Array.isArray(plan.days)) return false;
    if (plan.days.length !== totalDays) return false;
    for (const day of plan.days) {
      if (!day.day || !day.area || !Array.isArray(day.slots)) return false;
      if (day.slots.length !== slots.length) return false;
      const allowedSlots = new Set(slots);
      for (const slot of day.slots) {
        if (!allowedSlots.has(slot.time)) return false;
        if (!slot.place || slot.place.trim().length < 2 || !slot.desc || !slot.tag) return false;
      }
    }
    return true;
  }

  function hasBadPlaceName(plan) {
    const exactBanned = ['○○','XX','장소명','실제 장소','장소 정보를 다시 생성해주세요','다시 생성','장소 정보','관광안내소','근처 카페','근처 식당','인근','현지 추천 장소'];
    const categoryOnly = ['맛집','식당','카페','레스토랑','음식점','호텔','숙소','펜션','고기국수','흑돼지','갈치조림','전복죽','해산물','돔베고기','브런치','라멘','스시','우동','타코야키','오코노미야키','팟타이','똠얌꿍','망고스티키라이스','대표 명소','대표 관광지','감성 카페','브런치 카페','로컬 맛집','인기 식당','짬뽕집','짬뽕'];
    const genericPattern = /^[가-힣A-Za-z0-9\s·&'’.-]+(맛집|식당|카페|레스토랑|음식점|고기국수|흑돼지|갈치조림|전복죽|해산물|돔베고기|브런치 카페|감성 카페|로컬 맛집|인기 식당|대표 명소|대표 관광지|팟타이|똠얌꿍|짬뽕집|짬뽕)$/;
    const allPlaces = (plan?.days || []).flatMap(d => d.slots || []).map(s => (s.place || '').trim());
    return allPlaces.some(place => {
      if (!place || place.length < 2) return true;
      if (exactBanned.some(word => place.includes(word))) return true;
      if (categoryOnly.includes(place)) return true;
      if (genericPattern.test(place)) return true;
      return false;
    });
  }

  function hasWrongRegion(plan, destination) {
    const info = getCityInfo(destination);
    if (!info) return false;
    const text = (plan?.days || []).flatMap(d => d.slots || []).map(s => `${s.place || ''} ${s.desc || ''}`).join(' ');
    if (info.blocked.some(w => text.includes(w))) return true;
    return false;
  }

  async function callOpenAI(params) {
    const { destination, duration, companion, extras, themes, dateType, dateStart, dateEnd, retry = false } = params;
    const totalDays = getTotalDays(duration);
    const slots = getSlots(duration);
    const info = getCityInfo(destination);
    const seedPlaces = info?.seed || [];
    const themeStr = themes.length > 0 ? themes.join(', ') : '자유 여행';
    const extrasStr = extras.length > 0 ? extras.join(', ') : '없음';
    const dateStr = dateType === '미정' ? '미정' : `${dateStart || ''} ~ ${dateEnd || ''}`;
    const nokids = extras.includes('노키즈존 제외');
    const hasElder = extras.includes('노약자 동반');
    const hasChild = extras.includes('어린 아이 동반');

    const companionContext = [
      companion === '연인' ? '연인과 함께하는 로맨틱한 여행으로 구성하세요.' : '',
      companion === '친구' ? '친구들과 활기차고 즐거운 여행으로 구성하세요.' : '',
      companion === '가족' ? '가족 모두가 즐길 수 있는 여행으로 구성하세요.' : '',
      companion === '혼자' ? '혼자만의 자유롭고 여유로운 여행으로 구성하세요.' : '',
      hasElder ? '노약자 동반이므로 이동 거리가 짧고 접근성이 좋은 장소 위주로 구성하세요.' : '',
      hasChild ? '어린 아이 동반이므로 아이 친화적인 장소 위주로 구성하세요.' : '',
      nokids ? '노키즈존 가능성이 있는 곳은 피하고 아이 입장 가능한 장소 위주로 추천하세요.' : ''
    ].filter(Boolean).join(' ');

    const slotNote = duration === '당일치기'
      ? '당일치기이므로 days 배열은 정확히 1개, slots는 오전과 오후 2개만 작성하세요. 저녁 슬롯은 절대 작성하지 마세요.'
      : `days 배열은 정확히 ${totalDays}개, 각 day의 slots는 오전/오후/저녁 3개로 작성하세요.`;

    const prompt = `당신은 ${destination} 전문 여행 플래너입니다.

[절대 규칙]
1. 모든 place 필드는 반드시 "${destination}" 지역 안에 실제로 존재하는 상호명/장소명이어야 합니다.
2. 다른 도시/지역 장소는 절대 포함하지 마세요.
3. 음식명/카테고리명만 place에 쓰면 안 됩니다. 예: "팟타이", "짬뽕집", "맛집", "카페", "식당" 금지.
4. place에는 실제 식당명/카페명/명소명을 써야 합니다.
5. 정확한 상호명이 불확실하면 아래 참고 장소 중에서 선택하거나, 널리 알려진 실제 명소/시장/공원 이름을 사용하세요.
6. ${slotNote}
7. JSON 외 텍스트, 마크다운은 절대 포함하지 마세요.

참고 가능한 ${destination} 실제 장소 후보:
${seedPlaces.length ? seedPlaces.map(p => `- ${p}`).join('\n') : '- 해당 도시의 널리 알려진 실제 명소, 시장, 거리, 미술관, 식당 상호명'}

여행 정보:
- 여행지: ${destination}
- 기간: ${duration} (총 ${totalDays}일)
- 동행: ${companion || '미정'}${extrasStr !== '없음' ? ` (${extrasStr})` : ''}
- 테마: ${themeStr}
- 날짜: ${dateStr}
- 조건: ${companionContext}

${retry ? '[재시도] 이전 응답에 다른 지역 장소, 대명사, 카테고리명 또는 기간 오류가 있었습니다. place를 반드시 위 실제 후보와 같은 도시 내 실제 장소명으로 수정하세요.' : ''}

반환 형식(JSON만):
{
  "intro": "${destination} 여행을 한 문장으로 감성적으로 표현",
  "days": ${buildDaysTemplate(destination, totalDays, slots)}
}`;

    const apiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: retry ? 0.2 : 0.45,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: `Return valid JSON only. You specialize in ${destination}. Every place must be a real venue/place in ${destination}. Never use generic food/category names. Never include places from other cities. days length exactly ${totalDays}. ${duration === '당일치기' ? 'For 당일치기, exactly 2 slots: 오전 and 오후.' : 'Each day exactly 3 slots: 오전, 오후, 저녁.'}` },
          { role: 'user', content: prompt }
        ]
      })
    });
    const raw = await apiRes.text();
    if (!apiRes.ok) throw new Error(`OpenAI API 오류: ${raw}`);
    const parsed = JSON.parse(raw);
    return extractJson(parsed.choices?.[0]?.message?.content || '');
  }

  try {
    if (!process.env.OPENAI_API_KEY) return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'OPENAI_API_KEY가 없습니다.' }) };
    const body = JSON.parse(event.body || '{}');
    const { destination, duration, companion, extras = [], themes = [], dateType, dateStart, dateEnd } = body;
    if (!destination) return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: '여행지가 없습니다.' }) };

    const totalDays = getTotalDays(duration);
    const slots = getSlots(duration);
    let plan = await callOpenAI({ destination, duration, companion, extras, themes, dateType, dateStart, dateEnd, retry: false });

    if (!isValidPlan(plan, totalDays, slots) || hasBadPlaceName(plan) || hasWrongRegion(plan, destination)) {
      plan = await callOpenAI({ destination, duration, companion, extras, themes, dateType, dateStart, dateEnd, retry: true });
    }

    if (!isValidPlan(plan, totalDays, slots) || hasBadPlaceName(plan) || hasWrongRegion(plan, destination)) {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: '선택한 지역의 실제 장소명 생성에 실패했습니다.' }) };
    }

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan, duration, totalDays }) };
  } catch (err) {
    console.error('generate-plan error:', err);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: err.message || '서버 오류' }) };
  }
};
