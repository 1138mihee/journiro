export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      plan: {
        intro: "테스트 일정이 정상적으로 연결되었습니다.",
        days: [
          {
            day: "Day 1",
            area: "부산 해운대",
            theme: "바다 산책 & 맛집",
            slots: [
              {
                time: "오전",
                emoji: "🌊",
                place: "해운대해수욕장",
                desc: "부산 여행의 시작으로 부담 없는 바다 산책 코스예요.",
                tag: "바다"
              },
              {
                time: "오후",
                emoji: "☕",
                place: "달맞이길",
                desc: "해운대에서 이어지는 감성 산책길로 카페와 전망 포인트가 많아요.",
                tag: "카페"
              },
              {
                time: "저녁",
                emoji: "🥩",
                place: "해운대암소갈비집",
                desc: "부산 대표 식당 중 하나로 저녁 식사 후보로 좋아요.",
                tag: "맛집"
              }
            ]
          },
          {
            day: "Day 2",
            area: "영도 · 남포동",
            theme: "골목 산책 & 로컬 먹거리",
            slots: [
              {
                time: "오전",
                emoji: "🏘️",
                place: "흰여울문화마을",
                desc: "바다를 따라 걷는 골목 풍경이 예뻐 사진 찍기 좋은 코스예요.",
                tag: "산책"
              },
              {
                time: "오후",
                emoji: "🛍️",
                place: "국제시장",
                desc: "부산의 로컬 분위기를 느끼기 좋은 시장 코스예요.",
                tag: "시장"
              },
              {
                time: "저녁",
                emoji: "🍢",
                place: "BIFF광장",
                desc: "간식과 야식을 즐기기 좋은 남포동 대표 코스예요.",
                tag: "간식"
              }
            ]
          }
        ]
      }
    }),
  };
}
