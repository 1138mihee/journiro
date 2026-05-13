import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "Method not allowed" }),
      };
    }

    const {
      destination,
      duration,
      companion,
      extras = [],
      themes = [],
      dateType,
      dateStart,
      dateEnd,
    } = JSON.parse(event.body || "{}");

    const themeStr = themes.length > 0 ? themes.join(", ") : "자유 여행";
    const extrasStr = extras.length > 0 ? extras.join(", ") : "없음";
    const dateStr = dateType === "미정" ? "미정" : `${dateStart || ""} ~ ${dateEnd || ""}`;

    const prompt = `
당신은 친절하고 현실적인 여행 플래너입니다.

여행 정보:
- 여행지: ${destination}
- 기간: ${duration}
- 동행: ${companion}${extrasStr !== "없음" ? ` (${extrasStr})` : ""}
- 테마: ${themeStr}
- 여행 날짜: ${dateStr}

아래 형식으로 무료 요약 일정을 작성해주세요.

형식:
한 줄 감성 소개

Day 1 - [지역명]
• 오전: [장소명] — 한 줄 설명
• 오후: [장소명] — 한 줄 설명
• 저녁: [장소명] — 한 줄 설명

Day 2 - [지역명]
• 오전: [장소명] — 한 줄 설명
• 오후: [장소명] — 한 줄 설명
• 저녁: [장소명] — 한 줄 설명

✂️ 상세 가이드에는 Day 3 이후 일정 + 예약 팁 + 예산표가 포함돼 있어요

규칙:
- 동행자(${companion})와 특이사항(${extrasStr})에 맞게 조정
- 아이 동반이면 무리한 동선, 늦은 밤 일정, 웨이팅 긴 장소는 줄이기
- 노약자 동반이면 계단·긴 도보·환승 많은 일정은 피하기
- ${dateType !== "미정" && dateStart ? `${dateStart} 출발 기준 시즌 특성 반영` : "계절 정보는 일반적인 여행 팁으로만 반영"}
- 구체적인 실제 장소명 포함
- 무료 요약이지만 사용자가 충분히 참고할 수 있게 작성
- 500자 이내
- 한국어로 작성
`;

    const response = await client.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ text: response.output_text }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "AI 일정 생성 실패",
        detail: error.message,
      }),
    };
  }
}
