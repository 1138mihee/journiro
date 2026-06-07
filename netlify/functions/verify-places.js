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

  async function localSearch(query, display = 3) {
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

  function clean(text = '') {
    return text.replace(/<[^>]*>/g, '').trim();
  }

  try {
    const params = event.queryStringParameters || {};
    const city = params.city || '도쿄';
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

    for (const name of names) {
      const query = `${city} ${name}`;
      const result = await localSearch(query, 3);
      const item = result.items?.[0];

      if (!item) continue;

      verified.push({
        inputName: name,
        name: clean(item.title),
        category: item.category || '',
        address: item.address || '',
        roadAddress: item.roadAddress || '',
        telephone: item.telephone || '',
        link: item.link || '',
        mapx: item.mapx || '',
        mapy: item.mapy || ''
      });
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        city,
        count: verified.length,
        places: verified
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
