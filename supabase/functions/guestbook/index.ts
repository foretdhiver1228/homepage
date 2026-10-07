import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { decryptPayload, encryptPayload, ipFingerprint, passwordHash, verifyPassword } from './crypto.ts';

const env=(key:string)=>Deno.env.get(key)??'';
const projectUrl=env('SUPABASE_URL');
const serviceKey=env('HOME_SUPABASE_SECRET_KEY')||env('SUPABASE_SERVICE_ROLE_KEY');
const encryptionKey=env('HOME_ENCRYPTION_KEY');
const allowedOrigins=env('HOME_ALLOWED_ORIGINS').split(',').map(s=>s.trim()).filter(Boolean);
const turnstileSecret=env('HOME_TURNSTILE_SECRET_KEY');
const allowedHosts=new Set(allowedOrigins.map(origin=>{try{return new URL(origin).hostname;}catch{return '';}}).filter(Boolean));
const service=projectUrl&&serviceKey?createClient(projectUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}}):null;
type Row={id:string;nickname:string;website:string|null;is_secret:boolean;body:string|null;reply:string|null;encrypted_payload:string;nonce:string;encryption_version:number;password_hash:string;password_salt:string;password_iterations:number;created_at:string;updated_at:string};
class HttpError extends Error {constructor(public code:number,message:string){super(message);}}
function text(value:unknown,max:number,required=false){if(typeof value!=='string')return required?fail(400,'입력 내용을 확인해 주세요.') : '';const trimmed=value.trim();if(trimmed.length>max||(required&&!trimmed))fail(400,'입력 길이를 확인해 주세요.');return trimmed;}
function fail(code:number,message:string):never{throw new HttpError(code,message);}
function website(value:unknown){const v=text(value,500);if(!v)return null;try{const u=new URL(v);if(u.protocol!=='https:'||u.username||u.password)fail(400,'홈페이지는 https:// 주소를 사용해 주세요.');return u.href;}catch{fail(400,'홈페이지 주소를 확인해 주세요.');}}
function summary(row:Row){return {id:row.id,nickname:row.nickname,website:row.website,is_secret:row.is_secret,body:row.is_secret?null:row.body,reply:row.is_secret?null:row.reply,created_at:row.created_at,updated_at:row.updated_at};}
async function owner(req:Request){
  if(!service)return false;
  const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');if(!token)return false;
  const {data:{user},error}=await service.auth.getUser(token);if(error||!user)return false;
  const {data,error:dbError}=await service.from('home_admins').select('user_id').eq('user_id',user.id).maybeSingle();
  if(dbError)fail(503,'관리자 권한을 확인하지 못했어요.');return !!data;
}
async function limit(key:string,max:number,seconds:number){
  const {data,error}=await service!.rpc('consume_guestbook_limit',{p_key:key,p_max:max,p_seconds:seconds});
  if(error)fail(503,'방명록 설정을 확인해 주세요.');if(data!==true)fail(429,'요청이 많아요. 잠시 후 다시 시도해 주세요.');
}
async function unpack(row:Row){return row.is_secret?{...summary(row),...await decryptPayload(row,encryptionKey)}:summary(row);}
async function verifyVisitor(token:unknown,action:string){
  if(!turnstileSecret)fail(503,'방문자 확인 서버 설정이 필요해요.');
  if(typeof token!=='string'||!token||token.length>2048)fail(403,'방문자 확인을 완료한 뒤 다시 시도해 주세요.');
  let validation:{success?:boolean;action?:string;hostname?:string};
  try{
    const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({secret:turnstileSecret,response:token}),signal:AbortSignal.timeout(10000),
    });
    if(!response.ok)throw new Error();validation=await response.json();
  }catch{fail(503,'방문자 확인에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');}
  if(validation?.success!==true||validation.action!==action||!validation.hostname||!allowedHosts.has(validation.hostname))fail(403,'방문자 확인이 만료되었거나 유효하지 않아요. 다시 확인해 주세요.');
}
Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('Origin');
  const cors:Record<string,string>={'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
  if(origin&&allowedOrigins.includes(origin))cors['Access-Control-Allow-Origin']=origin;
  const respond=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:cors});
  if(origin&&!allowedOrigins.includes(origin))return respond(403,{error:'허용되지 않은 사이트입니다.'});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST')return respond(405,{error:'POST 요청을 사용해 주세요.'});
  try{
    if(!service||!encryptionKey||!allowedOrigins.length)fail(503,'방명록 서버의 키와 허용 주소를 설정해 주세요.');
    if(req.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json')fail(415,'JSON 요청을 사용해 주세요.');
    // Bound body memory even when Content-Length is absent.
    if(Number(req.headers.get('Content-Length')??0)>12000)fail(413,'요청이 너무 큽니다.');
    const reader=req.body?.getReader();let raw='';let size=0;const decoder=new TextDecoder();
    if(!reader)fail(400,'입력 내용이 없습니다.');
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>12000){await reader.cancel();fail(413,'요청이 너무 큽니다.');}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();
    let input:Record<string,unknown>;try{const parsed=JSON.parse(raw);if(!parsed||Array.isArray(parsed)||typeof parsed!=='object')throw new Error();input=parsed;}catch{fail(400,'요청 형식을 확인해 주세요.');}
    const action=text(input.action,20,true);
    if(['admin_list','backup','reply','delete'].includes(action)){
      if(!await owner(req))fail(403,'집주인만 사용할 수 있어요.');
      if(action==='admin_list'||action==='backup'){
        const rows:Row[]=[];let start=0;
        do {const {data,error}=await service!.from('guestbook').select('*').order('created_at',{ascending:false}).order('id').range(start,start+199);if(error)fail(503,'방명록을 불러오지 못했어요.');rows.push(...data as Row[]);if(data.length<200||action==='admin_list')break;start+=200;}while(true);
        // Fail the entire export if any secret cannot be decrypted; never silently omit it.
        const result=[];for(const row of rows)result.push(await unpack(row));return respond(200,{entries:result});
      }
      const id=text(input.id,36,true);if(!/^[0-9a-f-]{36}$/i.test(id))fail(400,'글 번호를 확인해 주세요.');
      if(action==='delete'){const {error}=await service!.from('guestbook').delete().eq('id',id);if(error)fail(503,'삭제하지 못했어요.');return respond(200,{ok:true});}
      const reply=text(input.reply,2000);const {data:row,error}=await service!.from('guestbook').select('*').eq('id',id).maybeSingle();if(error||!row)fail(404,'글을 찾을 수 없어요.');
      let update:Record<string,unknown>={reply:reply||null};if(row.is_secret){const payload=await decryptPayload(row,encryptionKey);update=await encryptPayload({...payload,reply:reply||null},id,encryptionKey);}
      const {error:updateError}=await service!.from('guestbook').update(update).eq('id',id);if(updateError)fail(503,'답글을 저장하지 못했어요.');return respond(200,{ok:true});
    }
    if(action==='list'){
      const offset=Number(input.offset??0);if(!Number.isInteger(offset)||offset<0||offset>100000)fail(400,'페이지 번호를 확인해 주세요.');
      // Never fetch hashes or ciphertext for the public listing.
      const {data,error}=await service!.from('guestbook').select('id,nickname,website,is_secret,body,reply,created_at,updated_at').order('created_at',{ascending:false}).order('id').range(offset,offset+19);
      if(error)fail(503,'방명록을 불러오지 못했어요.');return respond(200,{entries:data!.map(row=>summary(row as Row)),hasMore:data!.length===20});
    }
    if(action!=='create'&&action!=='read')fail(400,'지원하지 않는 요청입니다.');
    // A client-supplied Origin or IP header is not proof of identity. Require server-verified,
    // single-use Turnstile tokens and global/entry limits as well as the secondary IP buckets.
    await verifyVisitor(input.captcha_token,`guestbook_${action}`);
    const ip=req.headers.get('x-forwarded-for')?.split(',')[0].trim()||'unknown';const fingerprint=await ipFingerprint(ip,encryptionKey);
    if(action==='create'){
      if(input.website_check)fail(400,'등록할 수 없는 요청입니다.');
      await limit('create-global-day',200,86400);await limit(`create-hour:${fingerprint}`,4,3600);
      const nickname=text(input.nickname,40,true);const body=text(input.body,2000,true);const isSecret=input.is_secret===true;const link=website(input.website);
      const id=crypto.randomUUID();let data:Record<string,unknown>={id,nickname,body,website:link,is_secret:isSecret};
      if(isSecret){const password=text(input.password,128,true);if(password.length<12)fail(400,'비밀글 비밀번호는 12자 이상으로 정해 주세요.');const hash=await passwordHash(password);const encrypted=await encryptPayload({body,reply:null},id,encryptionKey);data={...data,body:null,reply:null,...encrypted,password_hash:hash.hash,password_salt:hash.salt,password_iterations:hash.iterations};}
      const {error}=await service!.from('guestbook').insert(data);if(error)fail(503,'방명록을 저장하지 못했어요.');return respond(201,{ok:true,id});
    }
    if(action==='read'){
      const id=text(input.id,36,true);if(!/^[0-9a-f-]{36}$/i.test(id))fail(400,'글 번호를 확인해 주세요.');
      await limit('read-global-day',2000,86400);await limit(`read-entry-all:${id}`,100,3600);await limit(`read-global:${fingerprint}`,30,3600);await limit(`read-entry:${id}:${fingerprint}`,5,600);
      const password=text(input.password,128,true);
      const {data:row,error}=await service!.from('guestbook').select('*').eq('id',id).maybeSingle();
      if(error)fail(503,'방명록을 불러오지 못했어요.');
      if(!row||!row.is_secret||!await verifyPassword(password,row.password_hash,row.password_salt,row.password_iterations))fail(403,'비밀번호가 맞지 않거나 글을 찾을 수 없어요.');
      return respond(200,{entry:await unpack(row)});
    }
    fail(400,'지원하지 않는 요청입니다.');
  }catch(e){if(e instanceof HttpError)return respond(e.code,{error:e.message});console.error('Guestbook operation failed without logging request data.');return respond(500,{error:'방명록 처리에 실패했어요. 서버 설정을 확인해 주세요.'});}
});
