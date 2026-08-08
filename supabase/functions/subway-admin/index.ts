// 운영/광고주 콘솔 인증 + 특권 쓰기.
//
// 정적 호스팅에서 클라이언트가 접근 코드를 비교하는 방식은 보호가 되지 않는다
// (코드가 공개 저장소와 번들에 그대로 노출됨). 코드는 여기 서버 시크릿과만 비교하고,
// 통과하면 짧은 수명의 서명 토큰을 발급한다. admin:* 상태 쓰기는 이 토큰이 있어야만 가능하며
// RLS 쪽에서는 anon 의 admin:* 쓰기를 아예 막는다.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const URL_ = Deno.env.get("SUPABASE_URL") || "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ADMIN_CODE = Deno.env.get("SUBWAY_ADMIN_CODE") || "";
const ADV_CODE = Deno.env.get("SUBWAY_ADV_CODE") || "";
const SECRET = Deno.env.get("SUBWAY_ADMIN_SECRET") || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const out = (x: unknown, s = 200) => new Response(JSON.stringify(x), { status: s, headers: cors });

const TTL_MS = 8 * 60 * 60 * 1000;

// 역할별로 쓸 수 있는 키를 화이트리스트로 고정한다.
const WRITABLE: Record<string, string[]> = {
  admin: ["admin:cards", "admin:ads", "admin:reports", "admin:modlog"],
  advertiser: ["admin:ads"],
};

const b64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return b64url(new Uint8Array(sig));
}

// 길이 정보까지 포함해 타이밍 차이를 줄인 비교.
function safeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a), bb = new TextEncoder().encode(b);
  let diff = ab.length ^ bb.length;
  const n = Math.max(ab.length, bb.length);
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

async function issue(role: string): Promise<string> {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ r: role, e: Date.now() + TTL_MS })));
  return `${payload}.${await sign(payload)}`;
}

async function verify(token: string): Promise<{ role: string } | null> {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [payload, sig] = token.split(".", 2);
  if (!safeEqual(sig, await sign(payload))) return null;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    if (!json || typeof json.e !== "number" || Date.now() > json.e) return null;
    if (!WRITABLE[json.r]) return null;
    return { role: json.r };
  } catch { return null; }
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return out({ error: "method" }, 405);
  if (!SECRET || !SERVICE) return out({ error: "server_unconfigured" }, 503);

  let d: Record<string, unknown>;
  try { d = await req.json(); } catch { return out({ error: "bad_json" }, 400); }
  const action = String(d.action || "");

  if (action === "login") {
    const role = String(d.role || "");
    const code = String(d.code || "");
    const expected = role === "admin" ? ADMIN_CODE : role === "advertiser" ? ADV_CODE : "";
    // 코드가 설정되지 않은 역할은 로그인 자체를 막는다(빈 문자열로 통과하는 것을 방지).
    if (!expected) return out({ ok: false, error: "role_unconfigured" }, 403);
    // 실패 시 코드 대입 속도를 늦춘다.
    if (!safeEqual(code, expected)) {
      await new Promise((r) => setTimeout(r, 600));
      return out({ ok: false, error: "invalid_code" }, 401);
    }
    return out({ ok: true, token: await issue(role), expires_in: TTL_MS });
  }

  const auth = await verify(String(d.token || ""));
  if (!auth) return out({ ok: false, error: "unauthorized" }, 401);

  if (action === "state.set") {
    const key = String(d.key || "");
    if (!(WRITABLE[auth.role] || []).includes(key)) return out({ ok: false, error: "forbidden_key" }, 403);
    const r = await db("subway_runtime_state?on_conflict=key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ key, value: d.value ?? {}, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) return out({ ok: false, error: "db" }, 500);
    return out({ ok: true });
  }

  if (action === "ad.stats") {
    // 광고 성과는 클라이언트가 올린 카운터가 아니라 검증된 이벤트 테이블에서 집계한다.
    const r = await db("subway_ad_events?select=ad_id,event_type");
    if (!r.ok) return out({ ok: false, error: "db" }, 500);
    const rows = await r.json() as Array<{ ad_id: string; event_type: string }>;
    const stats: Record<string, { imp: number; clk: number }> = {};
    for (const row of rows) {
      const s = stats[row.ad_id] ||= { imp: 0, clk: 0 };
      if (row.event_type === "click") s.clk++; else s.imp++;
    }
    return out({ ok: true, stats });
  }

  return out({ error: "unknown_action" }, 400);
});
