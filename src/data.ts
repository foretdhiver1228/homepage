import { createClient } from '@supabase/supabase-js';
import type { Post, PostInput } from './types';
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
export const demo = !url && !key;
export const configError = !demo && (!url || !key || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url) || !key.startsWith('sb_publishable_'));
export const supabase = !demo && !configError ? createClient(url, key) : null;
const storageKey = 'retro-home-demo-v1';
const stamp = '2026-10-07T10:00:00+09:00';
export const samples: Post[] = [
  {id:'sample-diary',kind:'diary',title:'나만의 작은 방을 열었다',body:'샘플 게시물입니다.\n\n좋아하는 글과 그림을 한곳에 모으고 싶었다. 타임라인에 흘려보내기보다, 오래 꺼내 볼 수 있는 서랍 같은 공간.\n\n오늘은 그 첫 번째 페이지. 커다란 계획은 없어도 좋아하는 마음은 충분하다.',tags:['개인홈','첫 페이지'],status:'public',series_title:null,chapter_no:null,image_path:null,created_at:stamp,updated_at:stamp},
  {id:'sample-novel-1',kind:'novel',title:'늦은 밤의 우체국',body:'샘플 소설입니다.\n\n도시가 잠들면 골목 끝의 우체국에 불이 켜졌다. 이곳에는 보내지 못한 편지들이 도착했다.\n\n“수취인이 없는 편지도 받아주시나요?”\n\n우체국장은 오래된 우표를 한 장 꺼내며 웃었다. “아직 만나지 못했을 뿐일지도 모르죠.”',tags:['판타지','단편'],status:'public',series_title:'밤의 우체국',chapter_no:1,image_path:null,created_at:'2026-10-06T10:00:00+09:00',updated_at:stamp},
  {id:'sample-novel-2',kind:'novel',title:'별이 찍힌 우표',body:'샘플 소설입니다.\n\n우표에는 낯선 별자리가 그려져 있었다. 편지를 봉투에 넣자, 종이 위에서 작은 빛이 피어났다.\n\n밤의 우체국에서는 모든 여행이 한 문장에서 시작됐다.',tags:['판타지'],status:'public',series_title:'밤의 우체국',chapter_no:2,image_path:null,created_at:'2026-10-05T10:00:00+09:00',updated_at:stamp},
  {id:'sample-art',kind:'art',title:'별을 모으는 창문',body:'샘플 벡터 그림입니다.\n새벽의 색과 작은 별들을 모아 그린 창문.',tags:['낙서','밤'],status:'public',series_title:null,chapter_no:null,image_path:'/art/window.svg',created_at:'2026-10-04T10:00:00+09:00',updated_at:stamp},
];
function localPosts(): Post[] {
  try { const raw = localStorage.getItem(storageKey); if (!raw) return [...samples]; const parsed = JSON.parse(raw); if (!Array.isArray(parsed)) throw new Error(); return parsed.filter((p: Post) => typeof p.id === 'string' && typeof p.title === 'string' && typeof p.body === 'string' && Array.isArray(p.tags)); }
  catch { return [...samples]; }
}
export async function listPosts(): Promise<Post[]> {
  if (demo) return localPosts().sort((a,b) => b.created_at.localeCompare(a.created_at));
  if (!supabase) throw new Error('Supabase URL과 공개용 키를 확인해 주세요.');
  const { data, error } = await supabase.from('posts').select('*').order('created_at', {ascending:false});
  if (error) throw error; return data as Post[];
}
export async function listAllPosts(): Promise<Post[]> {
  if(demo)return listPosts();if(!supabase)throw new Error('Supabase 설정이 필요합니다.');
  const rows:Post[]=[];let offset=0;
  while(true){const {data,error}=await supabase.from('posts').select('*').order('created_at',{ascending:false}).order('id').range(offset,offset+199);if(error)throw error;rows.push(...data as Post[]);if(data.length<200)break;offset+=200;}
  return rows;
}
export async function savePost(input: PostInput, id?: string): Promise<void> {
  if (demo) { const rows=localPosts(); const now=new Date().toISOString(); const old=rows.find(p=>p.id===id); const post:Post={...input,id:id??crypto.randomUUID(),created_at:old?.created_at??now,updated_at:now}; localStorage.setItem(storageKey,JSON.stringify([post,...rows.filter(p=>p.id!==post.id)])); return; }
  if (!supabase) throw new Error('Supabase 설정이 필요합니다.');
  const {error}= id ? await supabase.from('posts').update(input).eq('id',id) : await supabase.from('posts').insert(input);
  if(error) throw error;
}
export async function deletePost(id:string) {
  if(demo) { localStorage.setItem(storageKey,JSON.stringify(localPosts().filter(p=>p.id!==id))); return; }
  if(!supabase) throw new Error('Supabase 설정이 필요합니다.');
  const {error}=await supabase.from('posts').delete().eq('id',id); if(error) throw error;
}
export async function imageUrl(path:string): Promise<string> {
  if(demo) return path;
  if(!supabase) return '';
  const {data,error}=await supabase.storage.from('artwork').createSignedUrl(path,600);
  if(error) throw error; return data.signedUrl;
}
export async function uploadImage(file:File, preservePng=false):Promise<string> {
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('JPG·PNG·WebP 이미지를 선택해 주세요.');
  if(file.size>20*1024*1024) throw new Error('원본은 20MB 이하로 선택해 주세요.');
  const bitmap=await createImageBitmap(file);
  const ratio=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas'); canvas.width=Math.max(1,Math.round(bitmap.width*ratio)); canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
  canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height); bitmap.close();
  const contentType=preservePng&&file.type==='image/png'?'image/png':'image/webp';
  const extension=contentType==='image/png'?'png':'webp';
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('이미지 변환 실패')),contentType,.85));
  if(blob.size>5*1024*1024) throw new Error('웹용 이미지 크기를 5MB 이하로 줄여 주세요.');
  if(demo) return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsDataURL(blob);});
  if(!supabase) throw new Error('Supabase 설정이 필요합니다.');
  const {data:{user},error:authError}=await supabase.auth.getUser(); if(authError||!user) throw new Error('먼저 로그인해 주세요.');
  const path=`${user.id}/${crypto.randomUUID()}.${extension}`;
  const {error}=await supabase.storage.from('artwork').upload(path,blob,{contentType,upsert:false});
  if(error) throw error; return path;
}
