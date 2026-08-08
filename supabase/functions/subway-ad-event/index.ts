// 광고 노출/클릭 기록.
//
// 이전에는 브라우저가 subway_ad_events 에 직접 INSERT 할 수 있어서
// curl 반복만으로 노출·클릭을 무한히 위조할 수 있었다(광고주 과금 사고).
// 이제 anon 의 직접 INSERT 는 RLS 에서 막고, 이 함수만 service_role 로 기록하며
// 캠페인 실재 여부·타겟 일치·세션당 빈도를 서버에서 검증한다.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const URL_ = Deno.env.get("SUPABASE_URL") || "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";

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
  // 공개 키와 정확히 일치할 때만 통과시킨다. 접두사 패턴 매칭은 위조를 그대로 허용하므로 쓰지 않는다.
  return !!ANON && (a === ANON || b === ANON);
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

// 같은 세션이 같은 광고를 반복 기록하지 못하게 하는 최소 간격.
const IMPRESSION_COOLDOWN_MIN = 30;
const CLICK_COOLDOWN_MIN = 1;
// 세션당 시간별 총 기록 상한.
const SESSION_HOURLY_CAP = 60;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return out({ error: "method" }, 405);
  if (!authed(req)) return out({ error: "unauthorized" }, 401);
  if (!SERVICE) return out({ error: "server_unconfigured" }, 503);

  let d: Record<string, unknown>;
  try { d = await req.json(); } catch { return out({ error: "bad_json" }, 400); }

  const type = String(d.event_type || "");
  const adId = String(d.ad_id || "").slice(0, 128);
  const sessionHash = String(d.session_hash || "");
  const stationKey = String(d.station_key || "").slice(0, 64);
  const lineKey = d.line_key == null ? null : String(d.line_key).slice(0, 64);
  const accuracy = Number.isFinite(Number(d.accuracy_m)) ? Math.round(Number(d.accuracy_m)) : null;
  const distance = Number.isFinite(Number(d.distance_m)) ? Math.round(Number(d.distance_m)) : null;

  if (type !== "impression" && type !== "click") return out({ error: "bad_type" }, 400);
  if (sessionHash.length < 16 || sessionHash.length > 128) return out({ error: "bad_session" }, 400);
  if (!adId || !stationKey) return out({ error: "bad_payload" }, 400);
  if (accuracy != null && (accuracy < 0 || accuracy > 5000)) return out({ error: "bad_accuracy" }, 400);
  if (distance != null && (distance < 0 || distance > 5000)) return out({ error: "bad_distance" }, 400);

  // 1) 캠페인이 실제로 존재하고 활성인지, 보고된 역/노선이 캠페인 타겟과 맞는지 서버가 확인한다.
  const adRes = await db(`subway_ads?select=id,station_key,line_key,radius_m,active,starts_at,ends_at&id=eq.${encodeURIComponent(adId)}&limit=1`);
  if (!adRes.ok) return out({ error: "db" }, 500);
  const ads = await adRes.json() as Array<Record<string, unknown>>;
  const ad = ads[0];
  if (!ad || ad.active !== true) return out({ ok: false, error: "unknown_campaign" }, 404);
  const nowMs = Date.now();
  if (ad.starts_at && Date.parse(String(ad.starts_at)) > nowMs) return out({ ok: false, error: "not_started" }, 409);
  if (ad.ends_at && Date.parse(String(ad.ends_at)) <= nowMs) return out({ ok: false, error: "ended" }, 409);
  if (String(ad.station_key) !== stationKey) return out({ ok: false, error: "station_mismatch" }, 409);
  if (ad.line_key && lineKey && String(ad.line_key) !== lineKey) return out({ ok: false, error: "line_mismatch" }, 409);
  const radius = Number(ad.radius_m) || 220;
  if (distance != null && distance > radius) return out({ ok: false, error: "out_of_radius" }, 409);

  // 2) 세션 단위 빈도 제한.
  const cooldownMin = type === "click" ? CLICK_COOLDOWN_MIN : IMPRESSION_COOLDOWN_MIN;
  const since = new Date(nowMs - cooldownMin * 60_000).toISOString();
  const dupRes = await db(
    `subway_ad_events?select=id&session_hash=eq.${encodeURIComponent(sessionHash)}` +
    `&ad_id=eq.${encodeURIComponent(adId)}&event_type=eq.${type}&created_at=gt.${encodeURIComponent(since)}&limit=1`,
  );
  if (!dupRes.ok) return out({ error: "db" }, 500);
  if ((await dupRes.json() as unknown[]).length) return out({ ok: true, deduped: true });

  const hourAgo = new Date(nowMs - 3_600_000).toISOString();
  const capRes = await db(
    `subway_ad_events?select=id&session_hash=eq.${encodeURIComponent(sessionHash)}` +
    `&created_at=gt.${encodeURIComponent(hourAgo)}&limit=${SESSION_HOURLY_CAP + 1}`,
  );
  if (!capRes.ok) return out({ error: "db" }, 500);
  if ((await capRes.json() as unknown[]).length > SESSION_HOURLY_CAP) {
    return out({ ok: false, error: "rate_limited" }, 429);
  }

  const ins = await db("subway_ad_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      event_type: type, ad_id: adId, station_key: stationKey, line_key: lineKey,
      session_hash: sessionHash, accuracy_m: accuracy, distance_m: distance,
    }),
  });
  if (!ins.ok) return out({ error: "db" }, 500);
  return out({ ok: true });
});
