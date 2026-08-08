import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const URL=Deno.env.get('SUPABASE_URL')||'',SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',ANON=Deno.env.get('SUPABASE_ANON_KEY')||'';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
function out(x:unknown,s=200){return new Response(JSON.stringify(x),{status:s,headers:cors});}
function authed(req:Request){const a=req.headers.get('apikey')||'',b=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');return (ANON&&(a===ANON||b===ANON))||/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(a);}
function norm(s:string){return s.normalize('NFKC').toLowerCase().replace(/[\s._\-~`'"*+|\\/]+/g,'').replace(/[0０]/g,'o').replace(/[1１!]/g,'i').replace(/[3３]/g,'e').replace(/[4４@]/g,'a').replace(/[5５$]/g,'s').replace(/[7７]/g,'t');}
const blocked=[
 {cat:'성적 표현',re:/(섹스|성관계|자위|딸딸|좆|자지|보지|야동|강간|sex|fuck|fucking|dick|cock|pussy|cunt|porn|rape|blowjob|handjob|anal|nude|nudes|性交|做爱|做愛|自慰|阴茎|陰莖|阴道|陰道|强奸|強姦|黄片|黃片|セックス|せっくす|オナニー|ちんこ|まんこ|レイプ|エロ動画)/i},
 {cat:'욕설/모욕',re:/(씨발|시발|ㅅㅂ|개새끼|새끼야|병신|ㅂㅅ|지랄|꺼져|미친놈|미친년|fuckyou|motherfucker|bitch|asshole|retard|pieceofshit|操你|草泥马|草泥馬|傻逼|妈的|媽的|去死|滚蛋|滾蛋|くそ|クソ|死ね|しね|バカ|ばか|アホ|あほ|きもい)/i},
 {cat:'혐오/위협',re:/(죽여버|죽이고싶|칼로|폭탄|테러|killyou|iwillkill|bombthreat|杀了你|殺了你|去死吧|殺す|ころす|ぶっ殺す)/i},
 {cat:'연락처/현실 위치 특정',re:/(01[016789]\d{7,8}|kakao|카톡|오픈채팅|telegram|텔레그램|instagram|인스타|lineid|라인아이디|몇번째칸|몇번칸|문앞|내옆|빨간옷|파란옷)/i}
];
function moderate(body:string){const raw=body.trim(),n=norm(raw);if(!raw)return{ok:false,category:'빈 메시지'};if(raw.length>300)return{ok:false,category:'길이 초과'};for(const b of blocked)if(b.re.test(raw)||b.re.test(n))return{ok:false,category:b.cat};if(/([ㅋㅎㅠㅜ])\1{14,}/.test(raw))return{ok:false,category:'도배'};return{ok:true,category:'ok'};}
async function db(path:string,init:RequestInit={}){return fetch(`${URL}/rest/v1/${path}`,{...init,headers:{apikey:SERVICE,Authorization:`Bearer ${SERVICE}`,'Content-Type':'application/json',...(init.headers||{})}});}
Deno.serve(async(req:Request)=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors});if(req.method!=='POST')return out({error:'method'},405);if(!authed(req))return out({error:'unauthorized'},401);let d:any;try{d=await req.json();}catch{return out({error:'bad_json'},400);}const action=String(d.action||'');
 if(action==='moderate'){const m=moderate(String(d.body||''));return out(m,m.ok?200:422);}
 if(action==='send'){const room=String(d.room_key||'').slice(0,120),sid=String(d.session_id||'').slice(0,128),nick=String(d.nick||'익명').slice(0,32),body=String(d.body||'');if(!room||sid.length<12)return out({error:'bad_session'},400);const m=moderate(body);if(!m.ok)return out({ok:false,blocked:true,category:m.category},422);const r=await db('subway_ephemeral_messages',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({room_key:room,session_id:sid,nick,body})});if(!r.ok)return out({error:'db'},500);const rows=await r.json();return out({ok:true,message:rows[0]});}
 if(action==='list'){const room=encodeURIComponent(String(d.room_key||'').slice(0,120)),after=encodeURIComponent(String(d.after||'1970-01-01T00:00:00Z'));const r=await db(`subway_ephemeral_messages?select=id,room_key,session_id,nick,body,created_at&room_key=eq.${room}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&created_at=gt.${after}&order=created_at.asc&limit=100`);if(!r.ok)return out({error:'db'},500);return out({ok:true,messages:await r.json()});}
 if(action==='leave'){const sid=encodeURIComponent(String(d.session_id||'').slice(0,128));if(!sid)return out({error:'bad_session'},400);const r=await db(`subway_ephemeral_messages?session_id=eq.${sid}`,{method:'DELETE'});if(!r.ok)return out({error:'db'},500);return out({ok:true});}
 return out({error:'unknown_action'},400);
});