// 탑승 중에만 유지되는 익명 채팅.
//
// 이전 버전의 문제:
//  - leave 가 클라이언트가 보낸 session_id 를 그대로 믿고 DELETE 해서, list 로 노출된
//    남의 session_id 만 알면 타인의 메시지를 전부 지울 수 있었다.
//  - list 응답이 session_id 를 그대로 내려줘 위 공격의 재료를 스스로 제공했다.
//  - authed() 가 `sb_publishable_` 접두사만 맞으면 통과시켜 사실상 무인증이었다.
//  - 레이트리밋이 전혀 없었다.
// 지금은 세션마다 서버 서명 토큰을 발급하고, 쓰기/삭제는 토큰 소유자만 가능하며,
// 외부에는 방 안에서만 유효한 익명 author 해시만 노출한다.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const URL_ = Deno.env.get("SUPABASE_URL") || "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
// 서명 키. SUBWAY_CHAT_SECRET 을 설정하는 것이 원칙이지만, 없을 때는
// 서버에만 존재하는 service_role 키에서 파생시킨다(브라우저로 나가지 않는 고엔트로피 값).
// 이렇게 두면 시크릿 설정을 잊어도 대화가 통째로 멈추지 않으면서 토큰 위조는 여전히 불가능하다.
const SECRET = Deno.env.get("SUBWAY_CHAT_SECRET") || (SERVICE ? `derived-chat|${SERVICE}` : "");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const out = (x: unknown, s = 200) => new Response(JSON.stringify(x), { status: s, headers: cors });

function authed(req: Request): boolean {
  const a = req.headers.get("apikey") || "";
  const b = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return !!ANON && (a === ANON || b === ANON);
}

const b64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmac(input: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input))));
}

function safeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a), bb = new TextEncoder().encode(b);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < Math.max(ab.length, bb.length); i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

// 방 밖으로 나가는 식별자는 (세션 × 방) 해시뿐이다. 방이 바뀌면 값도 바뀌므로
// 여러 방에 걸친 추적이 불가능하고, session_id 자체는 절대 응답에 넣지 않는다.
const authorOf = async (sid: string, room: string) => (await hmac(`author|${sid}|${room}`)).slice(0, 16);
const tokenOf = (sid: string) => hmac(`session|${sid}`);

async function requireSession(d: Record<string, unknown>): Promise<string | null> {
  const sid = String(d.session_id || "");
  const token = String(d.token || "");
  if (sid.length < 12 || sid.length > 128 || !token) return null;
  return safeEqual(token, await tokenOf(sid)) ? sid : null;
}

function norm(s: string) {
  return s.normalize("NFKC").toLowerCase()
    .replace(/[\s._\-~`'"*+|\\/]+/g, "")
    .replace(/[0０]/g, "o").replace(/[1１!]/g, "i").replace(/[3３]/g, "e")
    .replace(/[4４@]/g, "a").replace(/[5５$]/g, "s").replace(/[7７]/g, "t");
}

const blocked = [
  { cat: "성적 표현", re: /(섹스|성관계|자위|딸딸|좆|자지|보지|야동|강간|sex|fuck|fucking|dick|cock|pussy|cunt|porn|rape|blowjob|handjob|anal|nude|nudes|性交|做爱|做愛|自慰|阴茎|陰莖|阴道|陰道|强奸|強姦|黄片|黃片|セックス|せっくす|オナニー|ちんこ|まんこ|レイプ|エロ動画)/i },
  { cat: "욕설/모욕", re: /(씨발|시발|ㅅㅂ|개새끼|새끼야|병신|ㅂㅅ|지랄|꺼져|미친놈|미친년|fuckyou|motherfucker|bitch|asshole|retard|pieceofshit|操你|草泥马|草泥馬|傻逼|妈的|媽的|去死|滚蛋|滾蛋|くそ|クソ|死ね|しね|バカ|ばか|アホ|あほ|きもい)/i },
  { cat: "혐오/위협", re: /(죽여버|죽이고싶|칼로|폭탄|테러|killyou|iwillkill|bombthreat|杀了你|殺了你|去死吧|殺す|ころす|ぶっ殺す)/i },
  { cat: "연락처/현실 위치 특정", re: /(01[016789]\d{7,8}|kakao|카톡|오픈채팅|telegram|텔레그램|instagram|인스타|lineid|라인아이디|몇번째칸|몇번칸|문앞|내옆|빨간옷|파란옷)/i },
];

function moderate(body: string) {
  const raw = body.trim(), n = norm(raw);
  if (!raw) return { ok: false, category: "빈 메시지" };
  if (raw.length > 300) return { ok: false, category: "길이 초과" };
  for (const b of blocked) if (b.re.test(raw) || b.re.test(n)) return { ok: false, category: b.cat };
  if (/([ㅋㅎㅠㅜ])\1{14,}/.test(raw)) return { ok: false, category: "도배" };
  return { ok: true, category: "ok" };
}

async function db(path: string, init: RequestInit = {}) {
  return fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE, Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json", ...(init.headers || {}),
    },
  });
}

const SEND_PER_MINUTE = 12;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return out({ error: "method" }, 405);
  if (!authed(req)) return out({ error: "unauthorized" }, 401);
  if (!SECRET || !SERVICE) return out({ error: "server_unconfigured" }, 503);

  let d: Record<string, unknown>;
  try { d = await req.json(); } catch { return out({ error: "bad_json" }, 400); }
  const action = String(d.action || "");

  // 세션 토큰 발급. session_id 는 클라이언트가 만들되, 토큰 없이는 아무것도 쓰지 못한다.
  if (action === "join") {
    const sid = String(d.session_id || "");
    if (sid.length < 12 || sid.length > 128) return out({ error: "bad_session" }, 400);
    return out({ ok: true, token: await tokenOf(sid) });
  }

  if (action === "moderate") {
    const m = moderate(String(d.body || ""));
    return out(m, m.ok ? 200 : 422);
  }

  const sid = await requireSession(d);
  if (!sid) return out({ error: "unauthorized_session" }, 401);

  if (action === "send") {
    const room = String(d.room_key || "").slice(0, 120);
    const nick = String(d.nick || "익명").slice(0, 32);
    const body = String(d.body || "");
    if (!room) return out({ error: "bad_room" }, 400);

    const m = moderate(body);
    if (!m.ok) return out({ ok: false, blocked: true, category: m.category }, 422);

    // 레이트리밋: 같은 세션이 최근 1분간 보낸 메시지 수로 판단한다.
    const minuteAgo = new Date(Date.now() - 60_000).toISOString();
    const recent = await db(
      `subway_ephemeral_messages?select=id&session_id=eq.${encodeURIComponent(sid)}` +
      `&created_at=gt.${encodeURIComponent(minuteAgo)}&limit=${SEND_PER_MINUTE + 1}`,
    );
    if (!recent.ok) return out({ error: "db" }, 500);
    if ((await recent.json() as unknown[]).length >= SEND_PER_MINUTE) {
      return out({ ok: false, error: "rate_limited", category: "너무 빠르게 보내고 있어요" }, 429);
    }

    const r = await db("subway_ephemeral_messages", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ room_key: room, session_id: sid, nick, body }),
    });
    if (!r.ok) return out({ error: "db" }, 500);
    const rows = await r.json() as Array<Record<string, unknown>>;
    const row = rows[0] || {};
    return out({
      ok: true,
      message: {
        id: row.id, room_key: row.room_key, nick: row.nick, body: row.body,
        created_at: row.created_at, author: await authorOf(sid, room),
      },
    });
  }

  if (action === "list") {
    const room = String(d.room_key || "").slice(0, 120);
    if (!room) return out({ error: "bad_room" }, 400);
    const after = String(d.after || "1970-01-01T00:00:00Z");
    const r = await db(
      `subway_ephemeral_messages?select=id,room_key,session_id,nick,body,created_at` +
      `&room_key=eq.${encodeURIComponent(room)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}` +
      `&created_at=gt.${encodeURIComponent(after)}&order=created_at.asc&limit=100`,
    );
    if (!r.ok) return out({ error: "db" }, 500);
    const rows = await r.json() as Array<Record<string, unknown>>;
    // session_id 는 응답에서 제거하고 방 한정 익명 해시로 치환한다.
    const messages = await Promise.all(rows.map(async (m) => ({
      id: m.id, room_key: m.room_key, nick: m.nick, body: m.body, created_at: m.created_at,
      author: await authorOf(String(m.session_id), room),
    })));
    return out({ ok: true, messages, me: await authorOf(sid, room) });
  }

  if (action === "leave") {
    // 토큰으로 증명된 자기 세션만 지운다.
    const r = await db(`subway_ephemeral_messages?session_id=eq.${encodeURIComponent(sid)}`, { method: "DELETE" });
    if (!r.ok) return out({ error: "db" }, 500);
    // 만료분 청소를 겸한다(pg_cron 이 없어도 테이블이 무한히 자라지 않도록).
    await db(`subway_ephemeral_messages?expires_at=lt.${encodeURIComponent(new Date().toISOString())}`, { method: "DELETE" });
    return out({ ok: true });
  }

  return out({ error: "unknown_action" }, 400);
});
