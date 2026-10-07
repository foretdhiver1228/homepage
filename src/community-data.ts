import { demo, supabase } from './data';
export type GuestEntry={id:string;nickname:string;website:string|null;is_secret:boolean;body:string|null;reply:string|null;created_at:string;updated_at:string};
export type FriendLink={id:string;name:string;url:string;banner_url:string|null;description:string;created_at:string};
const localGuestKey='retro-home-guestbook-v1';const localLinkKey='retro-home-links-v1';
function readLocal<T>(key:string):T[]{try{const data=JSON.parse(localStorage.getItem(key)??'[]');return Array.isArray(data)?data:[];}catch{return [];}}
async function call<T>(action:string,payload:Record<string,unknown>={}):Promise<T>{
  if(!supabase)throw new Error('먼저 Supabase를 연결해 주세요.');
  const {data:{session}}=await supabase.auth.getSession();
  const headers:Record<string,string>={'Content-Type':'application/json',apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY};
  if(session?.access_token)headers.Authorization=`Bearer ${session.access_token}`;
  const response=await fetch(`${import.meta.env.VITE_SUPABASE_URL.replace(/\/$/,'')}/functions/v1/guestbook`,{method:'POST',headers,body:JSON.stringify({action,...payload}),cache:'no-store'});
  let data;try{data=await response.json();}catch{throw new Error('방명록 Edge Function이 배포되었는지 확인해 주세요.');}
  if(!response.ok)throw new Error(data.error??'방명록 요청에 실패했어요.');return data;
}
export async function listGuestbook(admin=false,offset=0):Promise<{entries:GuestEntry[];hasMore:boolean}>{
  if(demo){const rows=readLocal<GuestEntry>(localGuestKey);return {entries:rows.slice(offset,offset+(admin?200:20)),hasMore:rows.length>offset+20};}
  if(admin){const data=await call<{entries:GuestEntry[]}>('admin_list');return {...data,hasMore:false};}
  return call('list',{offset});
}
export async function createGuestEntry(input:{nickname:string;body:string;website:string;is_secret:boolean;password:string;website_check:string;captcha_token:string}){
  if(demo){if(input.is_secret)throw new Error('비밀 방명록은 Supabase와 서버를 연결한 뒤 사용할 수 있어요.');const now=new Date().toISOString();const row:GuestEntry={id:crypto.randomUUID(),nickname:input.nickname,body:input.body,website:input.website||null,is_secret:false,reply:null,created_at:now,updated_at:now};localStorage.setItem(localGuestKey,JSON.stringify([row,...readLocal<GuestEntry>(localGuestKey)]));return;}
  await call('create',input);
}
export async function readSecret(id:string,password:string,captcha_token:string):Promise<GuestEntry>{const data=await call<{entry:GuestEntry}>('read',{id,password,captcha_token});return data.entry;}
export async function replyGuest(id:string,reply:string){
  if(demo){const rows=readLocal<GuestEntry>(localGuestKey).map(e=>e.id===id?{...e,reply:reply||null,updated_at:new Date().toISOString()}:e);localStorage.setItem(localGuestKey,JSON.stringify(rows));return;}
  await call('reply',{id,reply});
}
export async function deleteGuest(id:string){if(demo){localStorage.setItem(localGuestKey,JSON.stringify(readLocal<GuestEntry>(localGuestKey).filter(e=>e.id!==id)));return;}await call('delete',{id});}
export async function backupGuestbook():Promise<GuestEntry[]>{if(demo)return readLocal<GuestEntry>(localGuestKey);return (await call<{entries:GuestEntry[]}>('backup')).entries;}
export async function listLinks():Promise<FriendLink[]>{if(demo)return readLocal<FriendLink>(localLinkKey);if(!supabase)throw new Error('Supabase 설정을 확인해 주세요.');const {data,error}=await supabase.from('site_links').select('*').order('created_at',{ascending:false});if(error)throw error;return data as FriendLink[];}
export function httpsUrl(value:string){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}}
export async function addLink(input:Omit<FriendLink,'id'|'created_at'>){
  const url=httpsUrl(input.url);const banner=input.banner_url?httpsUrl(input.banner_url):null;
  if(!url||(input.banner_url&&!banner))throw new Error('홈페이지와 배너는 https:// 주소를 입력해 주세요.');
  if(demo){localStorage.setItem(localLinkKey,JSON.stringify([{...input,url,banner_url:banner,id:crypto.randomUUID(),created_at:new Date().toISOString()},...readLocal<FriendLink>(localLinkKey)]));return;}
  if(!supabase)throw new Error('Supabase 설정을 확인해 주세요.');const {error}=await supabase.from('site_links').insert({...input,url,banner_url:banner});if(error)throw error;
}
export async function deleteLink(id:string){if(demo){localStorage.setItem(localLinkKey,JSON.stringify(readLocal<FriendLink>(localLinkKey).filter(l=>l.id!==id)));return;}if(!supabase)throw new Error('Supabase 설정을 확인해 주세요.');const {error}=await supabase.from('site_links').delete().eq('id',id);if(error)throw error;}
