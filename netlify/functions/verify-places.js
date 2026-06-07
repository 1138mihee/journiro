exports.handler = async function(event, context) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  };

  const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
  const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'NAVER API 키가 없습니다.' })
    };
  }

  const DOMESTIC_CITY_KEYWORDS = {
    '제주': ['제주', '제주시', '서귀포'],
    '부산': ['부산'],
    '서울': ['서울']
  };

  const OVERSEAS_CITIES = ['도쿄', '오사카', '후쿠오카', '다낭', '방콕'];

  function clean(text = '') {
    return text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  function normalizeCity(city = '') {
    if (city.includes('제주')) return '제주';
    if (city.includes('부산')) return '부산';
    if (city.includes('서울')) return '서울';
    if (city.includes('도쿄')) return '도쿄';
    if (city.includes('오사카')) return '오사카';
    if (city.includes('후쿠오카')) return '후쿠오카';
    if (city.includes('다낭')) return '다낭';
    if (city.includes('방콕')) return '방콕';
    return city;
  }

  function isTooShortName(name = '') {
    const compact = name.replace(/\s+/g, '');
    return compact.length <= 1;
  }

  function looksGeneric(name = '') {
    const banned = [
      '맛집', '카페', '식당', '숙소', '호텔', '명소', '여행지',
      '진', '집', '곳', '거리', '시장'
    ];
    return banned.includes(name.trim());
  }

  function isDomesticCity(city) {
    return Boolean(DOMESTIC_CITY_KEYWORDS[city]);
  }

  function isOverseasCity(city) {
    return OVERSEAS_CITIES.includes(city);
  }

  async function localSearch(query, display = 5) {
    const url = new URL('https://openapi.naver.com/v1/search/local.json');
    url.searchParams.set('query', query);
    url.searchParams.set('display', String(display));

    const res = await fetch(url.toString(), {
      headers: {
        'X-Naver-Client-Id': NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': NAVER_CLIENT_SECRET
      }
    });

    const raw = await res.text();
    if (!res.ok) throw new Error(raw);
    return JSON.parse(raw);
  }

  function addressMatchesDomesticCity(city, item) {
    const keywords = DOMESTIC_CITY_KEYWORDS[city] || [];
    const addressText = `${item.address || ''} ${item.roadAddress || ''}`;
    return keywords.some(keyword => addressText.includes(keyword));
  }

  function nameLooksRelated(inputName, item) {
    const input = inputName.replace(/\s+/g, '').toLowerCase();
    const title = clean(item.title).replace(/\s+/g, '').toLowerCase();

    if (!input || !title) return false;

    // 입력명이 너무 짧으면 정확 매칭만 허용
    if (input.length <= 2) {
      return title === input || title.includes(inputName.toLowerCase());
    }

    return title.includes(input) || input.includes(title);
  }

  try {
    const params = event.queryStringParameters || {};
    const rawCity = params.city || '도쿄';
    const city = normalizeCity(rawCity);

    const names = (params.names || '')
      .split(',')
      .map(v => v.trim())
      .filter(Boolean);

    if (names.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'names 파라미터가 필요합니다. 예: ?city=도쿄&names=긴자 이마카츠,츠지한'
        })
      };
    }

    const verified = [];
    const unverified = [];
    const rejected = [];

    for (const name of names) {
      if (isTooShortName(name) || looksGeneric(name)) {
        rejected.push({
          inputName: name,
          reason: '장소명이 너무 짧거나 일반명사라 제외'
        });
        continue;
      }

      // 해외 도시는 네이버 지역검색이 국내 장소를 잘못 반환하는 경우가 많아서
      // 지역검색 검증 대신 후기 기반 후보로 분리합니다.
      if (isOverseasCity(city)) {
        unverified.push({
          inputName: name,
          name,
          status: 'unverified_overseas',
          reason: '해외 도시는 네이버 지역검색 오매칭 가능성이 높아 후기 기반 후보로 보관'
        });
        continue;
      }

      const query = `${city} ${name}`;
      const result = await localSearch(query, 5);
      const items = result.items || [];

      const matched = items.find(item => {
        return (
          addressMatchesDomesticCity(city, item) &&
          nameLooksRelated(name, item)
        );
      });

      if (!matched) {
        rejected.push({
          inputName: name,
          reason: '지역 또는 장소명 매칭 실패'
        });
        continue;
      }

      verified.push({
        inputName: name,
        name: clean(matched.title),
        category: matched.category || '',
        address: matched.address || '',
        roadAddress: matched.roadAddress || '',
        telephone: matched.telephone || '',
        link: matched.link || '',
        mapx: matched.mapx || '',
        mapy: matched.mapy || '',
        status: 'verified'
      });
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        city,
        count: verified.length,
        verified,
        unverified,
        rejected
      })
    };

  } catch (error) {
    console.error('verify-places error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: '장소 검증 중 오류가 발생했습니다.',
        detail: error.message
      })
    };
  }
};
