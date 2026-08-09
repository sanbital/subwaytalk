// AI 동행(companion) 생성기.
//
// 초기에는 같은 노선·방향에 사람이 거의 없어 라운지가 빈 화면으로 보인다.
// 그래서 실제 참여자가 적을 때만 AI 동행이 대화를 채우고, 사람이 늘면 스스로 줄어든다.
//
// 설계상 지켜야 하는 것:
//  · 서버에서 생성해 DB 에 넣는다. 클라이언트마다 다른 대화가 보이면 "같은 방향"이 성립하지 않는다.
//  · 사람 수가 목표치에 도달하면 AI 는 0이 된다(스스로 물러난다).
//  · 사람인 척하지 않는다. 메시지에 is_ai 표시가 붙고, 프롬프트에서도 부인하지 못하게 한다.
//  · 사람 메시지와 똑같이 moderate() 를 통과해야 저장된다.
import Anthropic from "npm:@anthropic-ai/sdk";

// 라운지가 "비어 보이지 않는" 최소 인원. 사람이 이만큼 모이면 AI 는 더 이상 등장하지 않는다.
const TARGET_PARTICIPANTS = Number(Deno.env.get("SUBWAY_AI_TARGET") || 4);
// 한 방에 동시에 존재할 수 있는 AI 동행 수 상한.
const MAX_COMPANIONS = Number(Deno.env.get("SUBWAY_AI_MAX") || 3);
// 같은 방에서 AI 발화 사이 최소 간격(초). 사람 대화를 덮지 않도록.
const MIN_GAP_SECONDS = Number(Deno.env.get("SUBWAY_AI_GAP_SECONDS") || 45);
// 방당 시간별 AI 발화 상한(비용 안전장치).
const HOURLY_CAP = Number(Deno.env.get("SUBWAY_AI_HOURLY_CAP") || 40);
// 최근 활동 판정 창(분).
const ACTIVITY_WINDOW_MIN = 15;

// 기본은 Claude Opus 5. 비용을 낮추려면 SUBWAY_AI_MODEL 로 claude-haiku-4-5 를 지정하면 된다.
const MODEL = Deno.env.get("SUBWAY_AI_MODEL") || "claude-opus-5";

const PERSONAS = [
  { nick: "졸린참새", trait: "늘 잠이 모자란 직장인. 짧게 툭 던지고 하품 섞인 말투." },
  { nick: "커피찾는판다", trait: "카페인 의존. 역 주변 카페 이야기를 자주 꺼냄." },
  { nick: "창가자리", trait: "창밖 풍경과 날씨를 관찰하는 조용한 사람." },
  { nick: "느린환승", trait: "환승이 잦아 노선 사정에 밝음. 담백하고 정보성." },
  { nick: "퇴근바라기", trait: "퇴근만 기다리는 사람. 자조적이지만 밝음." },
  { nick: "이어폰낀곰", trait: "음악 이야기를 자주 함. 말수 적고 짧음." },
];

const SYSTEM = `너는 한국 지하철 익명 라운지 "칙칙톡톡"의 AI 동행이다.
같은 노선을 타고 이동 중인 사람들이 잠깐 스치듯 나누는 대화에 자연스럽게 섞인다.

작성 규칙:
- 한국어 구어체. 1~2문장, 최대 60자 정도. 길면 안 된다.
- 지하철에서 스마트폰으로 툭 치는 말투. 완결된 문단이 아니라 한마디.
- 매번 질문으로 끝내지 마라. 대부분은 그냥 혼잣말이나 공감이다.
- 이모지는 쓰더라도 하나까지.
- 주어진 페르소나의 말투를 유지하되 매번 같은 소재를 반복하지 마라.

절대 하지 않는 것:
- 사람인 척하지 않는다. 사람이냐고 물으면 AI 동행이라고 솔직히 말한다.
- 연락처, SNS 계정, 만나자는 제안, 실제 위치 특정(몇 번째 칸, 옷차림 등)을 언급하지 않는다.
- 특정 인물·집단을 향한 비하, 성적 표현, 정치·종교 논쟁을 하지 않는다.
- 최근 대화에 이미 나온 말을 그대로 반복하지 않는다.

대화에 끼어들 만한 맥락이 아니면 skip 을 true 로 반환해라. 억지로 말할 필요 없다.`;

const SCHEMA = {
  type: "object",
  properties: {
    skip: { type: "boolean", description: "지금은 말할 타이밍이 아니면 true" },
    persona: { type: "string", description: "사용할 페르소나 닉네임" },
    text: { type: "string", description: "보낼 한마디. skip 이 true 면 빈 문자열" },
  },
  required: ["skip", "persona", "text"],
  additionalProperties: false,
} as const;

type Ctx = {
  room: string;
  line: string;
  direction: string;
  station: string | null;
  daypart: string;
  recent: Array<{ nick: string; body: string; is_ai: boolean }>;
  humans: number;
  companions: number;
};

/** 지금 이 방에 AI 동행을 하나 더 등장시켜야 하는지 판단한다. */
export function shouldGenerate(ctx: Ctx, lastAiAgeSeconds: number | null, aiLastHour: number): boolean {
  if (aiLastHour >= HOURLY_CAP) return false;
  if (lastAiAgeSeconds != null && lastAiAgeSeconds < MIN_GAP_SECONDS) return false;
  // 사람이 충분히 모이면 AI 는 물러난다.
  const wanted = Math.min(MAX_COMPANIONS, Math.max(0, TARGET_PARTICIPANTS - ctx.humans));
  return ctx.companions < wanted;
}

function daypartLabel(d: string): string {
  return ({ dawn: "이른 새벽", morning: "출근 시간", day: "낮", evening: "퇴근 시간", night: "늦은 밤" } as Record<string, string>)[d] || "이동 중";
}

/** 맥락에 맞는 한마디를 생성한다. 말할 타이밍이 아니면 null. */
export async function generateCompanionMessage(ctx: Ctx): Promise<{ nick: string; body: string } | null> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return null;

  const used = new Set(ctx.recent.filter((m) => m.is_ai).map((m) => m.nick));
  const available = PERSONAS.filter((p) => !used.has(p.nick));
  const pool = available.length ? available : PERSONAS;

  const client = new Anthropic({ apiKey });

  const context = [
    // "all" 은 방향으로 방을 가르지 않는 노선 단위 방이다.
    // 이때 상·하행을 단정하면 AI 가 없는 사실을 지어내게 된다.
    ctx.direction === "up" ? `노선: ${ctx.line} (상행 방향)`
      : ctx.direction === "down" ? `노선: ${ctx.line} (하행 방향)`
      : `노선: ${ctx.line} (상·하행 섞임 — 방향은 언급하지 마라)`,
    ctx.station ? `현재 역: ${ctx.station}` : null,
    `시간대: ${daypartLabel(ctx.daypart)}`,
    `실제 참여자: ${ctx.humans}명 / AI 동행: ${ctx.companions}명`,
    "",
    "쓸 수 있는 페르소나:",
    ...pool.map((p) => `- ${p.nick}: ${p.trait}`),
    "",
    ctx.recent.length ? "최근 대화(오래된 것부터):" : "아직 대화가 없다. 자연스럽게 첫 한마디를 던져라.",
    ...ctx.recent.map((m) => `${m.nick}: ${m.body}`),
  ].filter((v) => v !== null).join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000, // thinking + 출력 합산 상한. 출력 자체는 한두 문장이다.
    // 짧은 한마디에 깊은 사고는 필요 없다. 다만 thinking 을 끄면 Opus 5 는
    // 내부 태그가 본문으로 새는 실패 모드가 있어, 끄는 대신 effort 를 낮춘다.
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: [
      { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: context }],
  });

  if (response.stop_reason === "refusal") return null;

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") return null;

  let parsed: { skip?: boolean; persona?: string; text?: string };
  try { parsed = JSON.parse(block.text); } catch { return null; }
  if (!parsed || parsed.skip || !parsed.text) return null;

  const body = String(parsed.text).trim().slice(0, 300);
  if (!body) return null;

  const persona = pool.find((p) => p.nick === parsed.persona) || pool[0];
  return { nick: persona.nick, body };
}
