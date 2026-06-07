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

  const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
  const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET || !OPENAI_API_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'NAVER_CLIENT_ID, NAVER_CLIENT_SECRET, OPENAI_API_KEY 중 누락된 값이 있습니다.'
      })
    };
  }

  function stripHtml(text = '') {
    return text
      .replace(/<[^>]*>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function naverSearch(query, display = 10) {
    const url = new URL('https://openapi.naver.com/v1/search/blog.json');
    url.searchParams.set('query', query);
    url.searchParams.set('display', String(display));
    url.searchParams.set('sort', 'sim');

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

  async function extractPlacesWithOpenAI(city, query, items) {
    const reviewText = items.map((item, i) => {
      return `${i + 1}. 제목: ${stripHtml(item.title)}
내용: ${stripHtml(item.description)}`;
    }).join('\n\n');

    const prompt = `
아래는 네이버 블로그 검색 결과입니다.

도시: ${city}
검색어: ${query}

이 후기들에서 실제 장소명/상호명만 추출해주세요.

규칙:
- 실제 장소명, 식당명, 카페명, 숙소명, 명소명만 추출
- "맛집", "카페", "식당", "숙소", "핫플", "여행지" 같은 일반명사는 제외
- 음식명만 있는 것도 제외. 예: 라멘, 팟타이, 고기국수
- 도시와 관련 없는 장소는 제외
- 중복은 제거
- JSON만 반환

반환 형식:
{
  "places": [
    {
      "name": "장소명",
      "category": "맛집 | 카페 | 명소 | 숙소 | 쇼핑 | 기타",
      "reason": "추출 이유"
    }
  ]
}

검색 결과:
${reviewText}
`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You extract real travel place names from Korean travel reviews. Return valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    const raw = await res.text();
    if (!res.ok) throw new Error(raw);

    const parsed = JSON.parse(raw);
    const content = parsed.choices?.[0]?.message?.content || '{}';
    return JSON.parse(content);
  }

  try {
    const params = event.queryStringParameters || {};
    const city = params.city || '도쿄';
    const query = params.query || `${city} 맛집`;
    const display = Number(params.display || 10);

    const naver = await naverSearch(query, display);
    const items = naver.items || [];

    const extracted = await extractPlacesWithOpenAI(city, query, items);

    const unique = [];
    const seen = new Set();

    for (const place of extracted.places || []) {
      if (!place.name) continue;
      if (seen.has(place.name)) continue;
      seen.add(place.name);
      unique.push(place);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        city,
        query,
        count: unique.length,
        places: unique,
        sourceCount: items.length
      })
    };

  } catch (error) {
    console.error('extract-places error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: '장소명 추출 중 오류가 발생했습니다.',
        detail: error.message
      })
    };
  }
};
