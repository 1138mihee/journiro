exports.handler = async function(event, context) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  };

  function getBaseUrl(event) {
    const proto = event.headers['x-forwarded-proto'] || 'https';
    const host = event.headers.host;
    return `${proto}://${host}`;
  }

  async function callFunction(url) {
    const res = await fetch(url);
    const raw = await res.text();

    if (!res.ok) {
      throw new Error(raw);
    }

    return JSON.parse(raw);
  }

  function isOverseasCity(city = '') {
    return ['도쿄', '오사카', '후쿠오카', '다낭', '방콕'].some(c => city.includes(c));
  }

  function normalizeCategory(category = '') {
    if (category.includes('카페')) return '카페';
    if (category.includes('숙소') || category.includes('호텔')) return '숙소';
    if (category.includes('명소') || category.includes('관광')) return '명소';
    if (category.includes('쇼핑') || category.includes('시장')) return '쇼핑';
    return category || '기타';
  }

  try {
    const params = event.queryStringParameters || {};
    const city = params.city || '도쿄';
    const query = params.query || `${city} 맛집`;
    const display = Number(params.display || 10);

    const baseUrl = getBaseUrl(event);

    const extractUrl =
      `${baseUrl}/.netlify/functions/extract-places` +
      `?city=${encodeURIComponent(city)}` +
      `&query=${encodeURIComponent(query)}` +
      `&display=${encodeURIComponent(display)}`;

    const extracted = await callFunction(extractUrl);

    const names = (extracted.places || [])
      .map(p => p.name)
      .filter(Boolean);

    if (names.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          city,
          query,
          count: 0,
          places: [],
          rejected: [],
          message: '추출된 장소명이 없습니다.'
        })
      };
    }

    const verifyUrl =
      `${baseUrl}/.netlify/functions/verify-places` +
      `?city=${encodeURIComponent(city)}` +
      `&names=${encodeURIComponent(names.join(','))}`;

    const verifiedResult = await callFunction(verifyUrl);

    const extractedMap = new Map();

    for (const place of extracted.places || []) {
      if (!place.name) continue;
      extractedMap.set(place.name, place);
    }

    let finalPlaces = [];

    if (isOverseasCity(city)) {
      finalPlaces = (verifiedResult.unverified || []).map(item => {
        const original = extractedMap.get(item.inputName) || {};

        return {
          name: item.name || item.inputName,
          city,
          category: normalizeCategory(original.category),
          status: item.status || 'unverified_overseas',
          reason: original.reason || item.reason || '',
          source: 'naver_review'
        };
      });
    } else {
      finalPlaces = (verifiedResult.verified || []).map(item => {
        const original = extractedMap.get(item.inputName) || {};

        return {
          name: item.name,
          city,
          category: normalizeCategory(original.category || item.category),
          status: 'verified',
          reason: original.reason || '',
          address: item.address || '',
          roadAddress: item.roadAddress || '',
          telephone: item.telephone || '',
          link: item.link || '',
          mapx: item.mapx || '',
          mapy: item.mapy || '',
          source: 'naver_review_local'
        };
      });
    }

    const rejected = verifiedResult.rejected || [];

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        city,
        query,
        count: finalPlaces.length,
        places: finalPlaces,
        rejected,
        sourceCount: extracted.sourceCount || 0
      })
    };

  } catch (error) {
    console.error('build-place-pool error:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: '장소 후보 풀 생성 중 오류가 발생했습니다.',
        detail: error.message
      })
    };
  }
};
