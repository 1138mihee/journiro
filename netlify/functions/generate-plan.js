function extractJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end >= 0) return JSON.parse(cleaned.slice(start, end + 1));
  return JSON.parse(cleaned);
}

// 버그 수정 방향 유지: place 필드만 검사합니다.
// desc/theme/area에는 "감성 카페", "로컬 맛집", "인기 식당" 같은 표현이 자연스럽게 들어갈 수 있으므로 검사하지 않습니다.
function hasHardInvalidText(plan) {
  const banned = [
    "장소 정보를 다시 생성해주세요",
    "다시 생성",
    "관광안내소",
    "대표 관광지"
  ];

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
      if (slot.time && slot.place && slot.place.length >= 2 && slot.desc && slot.tag) {
        validSlotCount++;
      }
    }
  }

  return validSlotCount >= 3 && !hasHardInvalidText(plan);
}

async function callOpenAI({ destination, duration, companion, extras, themes, dateType, dateStart, dateEnd }) {
  const themeStr = themes.length > 0 ? themes.join(", ") : "자유 여행";
  const extrasStr = extras.length > 0 ? extras.join(", ") : "없음";
  const dateStr = dateType === "미정" ? "미정" : `${dateStart || ""} ~ ${dateEnd || ""}`;
  const nokids = extras.includes("노키즈존 제외");

  const prompt = `너는 여행 일정을 만드는 플래너다.
아래 조건에 맞춰 실제 장소명 중심의 여행 일정 JSON을 만들어줘.

여행 정보:
- 여행지: ${destination}
- 기간: ${duration}
- 동행: ${companion || "미정"}
- 추가 조건: ${extrasStr}
- 테마: ${themeStr}
- 날짜: ${dateStr}
${nokids ? "- 노키즈존은 제외하고 아이 입장 가능한 식당/카페/명소 위주로 추천해." : ""}

작성 규칙:
- Day 1, Day 2를 작성해.
- 각 Day는 오전/오후/저녁 3개 슬롯으로 작성해.
- place에는 반드시 실제 장소명/상호명을 써. 예: "스타벅스 리저브 로스터리 도쿄", "아라시야마 대나무숲", "이치란 라멘 신주쿠점"
- "관광안내소", "대표 관광지", "장소 정보를 다시 생성해주세요" 같은 임시 문구는 place 필드에 절대 쓰지 마.
- desc, theme, area에는 "감성 카페", "로컬 맛집", "인기 식당" 같은 표현을 써도 됨.
- JSON 외 텍스트, 마크다운, 코드블록은 절대 쓰지 마.

반환 JSON:
{
  "intro": "이 여행을 한 문장으로 감성적으로 표현",
  "days": [
    {
      "day": "Day 1",
      "area": "지역명",
      "theme": "이날의 테마",
      "slots": [
        { "time": "오전", "emoji": "☀️", "place": "실제 장소명", "desc": "왜 가면 좋은지 1~2줄", "tag": "카테고리" },
        { "time": "오후", "emoji": "🏛️", "place": "실제 장소명", "desc": "왜 가면 좋은지 1~2줄", "tag": "카테고리" },
        { "time": "저녁", "emoji": "🍜", "place": "실제 장소명", "desc": "왜 가면 좋은지 1~2줄", "tag": "카테고리" }
      ]
    },
    {
      "day": "Day 2",
      "area": "지역명",
      "theme": "이날의 테마",
      "slots": [
        { "time": "오전", "emoji": "☕", "place": "실제 장소명", "desc": "왜 가면 좋은지 1~2줄", "tag": "카테고리" },
        { "time": "오후", "emoji": "🌿", "place": "실제 장소명", "desc": "왜 가면 좋은지 1~2줄", "tag": "카테고리" },
        { "time": "저녁", "emoji": "🍣", "place": "실제 장소명", "desc": "왜 가면 좋은지 1~2줄", "tag": "카테고리" }
      ]
    }
  ]
}`;

  const apiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Return valid JSON only. No markdown, no code blocks, no preamble. Use specific real place names in the place field."
        },
        { role: "user", content: prompt }
      ]
    })
  });

  const raw = await apiRes.text();

  if (!apiRes.ok) {
    throw new Error(`OpenAI API request failed: ${raw}`);
  }

  const parsed = JSON.parse(raw);
  const content = parsed.choices?.[0]?.message?.content || "";
  return extractJson(content);
}

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
    }

    if (!process.env.OPENAI_API_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: "OPENAI_API_KEY가 없습니다." }) };
    }

    const body = JSON.parse(event.body || "{}");
    const {
      destination = "",
      duration = "",
      companion = "",
      extras = [],
      themes = [],
      dateType = "미정",
      dateStart = "",
      dateEnd = ""
    } = body;

    if (!destination) {
      return { statusCode: 400, body: JSON.stringify({ error: "여행지가 없습니다." }) };
    }

    const plan = await callOpenAI({ destination, duration, companion, extras, themes, dateType, dateStart, dateEnd });

    if (!isValidPlan(plan)) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "일정 형식이 올바르지 않습니다." })
      };
    }

    return { statusCode: 200, body: JSON.stringify({ plan }) };

  } catch (error) {
    console.error("generate-plan error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "AI 일정 생성 실패",
        detail: error.message
      })
    };
  }
}
