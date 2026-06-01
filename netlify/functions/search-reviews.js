exports.handler = async function(event, context) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (!['GET', 'POST'].includes(event.httpMethod)) {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
  const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET이 설정되지 않았습니다.' })
    };
  }

  const CITY_KEYWORDS = {
    '후쿠오카': ['후쿠오카 맛집', '후쿠오카 카페', '후쿠오카 아이랑', '후쿠오카 가족여행', '후쿠오카 숙소'],
    '오사카': ['오사카 맛집', '오사카 카페', '오사카 아이랑', '오사카 가족여행', '오사카 숙소'],
    '도쿄': ['도쿄 맛집', '도쿄 카페', '도쿄 아이랑', '도쿄 가족여행', '도쿄 숙소'],
    '제주': ['제주 맛집', '제주 카페', '제주 아이랑', '제주 가족여행', '제주 숙소'],
    '다낭': ['다낭 맛집', '다낭 카페', '다낭 아이랑', '다낭 가족여행', '다낭 숙소']
  };

  function stripHtml(text = '') {
    return text
      .replace(/<[^>]*>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeItem(item, source, query, city) {
    return {
      city,
      source,
      query,
      title: stripHtml(item.title || ''),
      description: stripHtml(item.description || ''),
      link: item.link || '',
      postdate: item.postdate || '',
      bloggername: item.bloggername || '',
      cafename: item.cafename || ''
    };
  }

  async function naverSearch({ type, query, display = 10, start = 1, sort = 'sim' }) {
    const endpoint = type === 'cafe'
      ? 'https://openapi.naver.com/v1/search/cafearticle.json'
      : 'https://openapi.naver.com/v1/search/blog.json';

    const url = new URL(endpoint);
    url.searchParams.set('query', query);
    url.searchParams.set('display', String(Math.min(Number(display) || 10, 100)));
    url.searchParams.set('start', String(Math.max(Number(start) || 1, 1)));
    url.searchParams.set('sort', sort);

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-Naver-Client-Id': NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': NAVER_CLIENT_SECRET
      }
    });

    const raw = await res.text();
    if (!res.ok) throw new Error(`Naver ${type} search failed: ${raw}`);
    return JSON.parse(raw);
  }

  function extractSignals(items) {
    const words = ['추천', '좋았', '만족', '재방문', '아이랑', '가족', '부모님', '유모차', '웨이팅', '예약', '주차', '비오는날', '실내'];
    const counts = {};

    for (const item of items) {
      const text = `${item.title} ${item.description}`;
      for (const word of words) {
        if (text.includes(word)) counts[word] = (counts[word] || 0) + 1;
      }
    }

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([keyword, count]) => ({ keyword, count }));
  }

  function getRequestParams(event) {
    if (event.httpMethod === 'POST') return JSON.parse(event.body || '{}');
    return event.queryStringParameters || {};
  }

  try {
    const params = getRequestParams(event);

    const city = params.city || '도쿄';
    const type = params.type || 'both';
    const display = Number(params.display || 10);
    const sort = params.sort || 'sim';
    const customQuery = params.query;

    const queries = customQuery
      ? [customQuery]
      : (CITY_KEYWORDS[city] || [`${city} 맛집`, `${city} 카페`, `${city} 가족여행`, `${city} 숙소`]);

    const results = [];

    for (const query of queries) {
      if (type === 'blog' || type === 'both') {
        const blog = await naverSearch({ type: 'blog', query, display, sort });
        results.push(...(blog.items || []).map(item => normalizeItem(item, 'blog', query, city)));
      }

      if (type === 'cafe' || type === 'both') {
        const cafe = await naverSearch({ type: 'cafe', query, display, sort });
        results.push(...(cafe.items || []).map(item => normalizeItem(item, 'cafe', query, city)));
      }
    }

    const unique = [];
    const seen = new Set();

    for (const item of results) {
      const key = item.link || `${item.source}-${item.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        city,
        queries,
        count: unique.length,
        signals: extractSignals(unique),
        items: unique
      })
    };

  } catch (error) {
    console.error('search-reviews error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: '네이버 후기 검색 중 오류가 발생했습니다.',
        detail: error.message
      })
    };
  }
};
