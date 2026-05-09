import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Method not allowed" }),
      };
    }

    const { destination, duration, morning, themes } = JSON.parse(event.body || "{}");

    if (!destination || !duration || !morning) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "여행지, 기간, 여행 리듬을 모두 입력해주세요." }),
      };
    }

    const themeStr = Array.isArray(themes) && themes.length ? themes.join(", ") : "자유 여행";
    const rhythmGuide = morning === "저녁형"
      ? "오전은 느긋하게 시작하고, 오후와 저녁 일정을 풍부하게 구성하세요."
      : "오전부터 알차게 움직일 수 있도록 동선을 구성하세요.";

    const prompt = `당신은 친절하고 섬세한 여행 플래너입니다.

여행 정보:
- 여행지: ${destination}
- 기간: ${duration}
- 여행 스타일: ${morning}
- 테마: ${themeStr}

작성 규칙:
- 첫 줄: 이 여행을 한 문장으로 감성적으로 표현
- Day별 오전/오후/저녁으로 나눠 핵심 장소와 활동 소개
- 각 항목은 1~2줄, 구체적인 장소명 포함
- ${rhythmGuide}
- 전체 일정의 60%만 작성해서 상세 가이드 구매 욕구가 생기게 구성
- 마지막 한 줄: "📎 상세 가이드에서는: [교통편·예약 팁·숨은 맛집·예산표 포함]"
- 700자 이내
- 한국어로 작성`;

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
      temperature: 0.8,
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: response.output_text }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "AI 일정 생성에 실패했습니다.",
        detail: error.message,
      }),
    };
  }
}
