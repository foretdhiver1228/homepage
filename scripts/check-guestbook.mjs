// Tests security boundaries without requiring a live Supabase project.
// Database and Auth responses are mocked; live JWT/RLS/gateway testing remains required.
import assert from 'node:assert/strict';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const temp=await mkdtemp(path.join(os.tmpdir(),'retro-guestbook-'));
const compiler={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext};
const transpile=s=>ts.transpileModule(s,{compilerOptions:compiler}).outputText;
const originalFetch=globalThis.fetch;
try {
  const source=await readFile(new URL('../supabase/functions/guestbook/crypto.ts',import.meta.url),'utf8');
  await writeFile(path.join(temp,'crypto.mjs'),transpile(source));
  const crypt=await import(pathToFileURL(path.join(temp,'crypto.mjs')).href);
  const key=crypt.base64(crypto.getRandomValues(new Uint8Array(32)));
  const payload={body:'비밀 방명록의 본문',reply:'비밀 답글'};
  const id=crypto.randomUUID();
  const first=await crypt.encryptPayload(payload,id,key);const second=await crypt.encryptPayload(payload,id,key);
  assert.notEqual(first.nonce,second.nonce,'Every encryption must use a fresh nonce');
  assert.notEqual(first.encrypted_payload,second.encrypted_payload);
  assert.deepEqual(await crypt.decryptPayload({...first,id},key),payload);
  const tampered=crypt.fromBase64(first.encrypted_payload);tampered[0]^=1;
  await assert.rejects(crypt.decryptPayload({...first,id,encrypted_payload:crypt.base64(tampered)},key),'Tampered ciphertext must fail');
  await assert.rejects(crypt.decryptPayload({...first,id:crypto.randomUUID()},key),'Ciphertext must be bound to the entry ID');
  await assert.rejects(crypt.decryptPayload({...first,id},crypt.base64(crypto.getRandomValues(new Uint8Array(32)))));
  const password='my long secret phrase';
  const pw=await crypt.passwordHash(password);assert.equal(pw.iterations,600000);
  assert.equal(await crypt.verifyPassword(password,pw.hash,pw.salt,pw.iterations),true);
  assert.equal(await crypt.verifyPassword('wrong password',pw.hash,pw.salt,pw.iterations),false);
  assert.notEqual((await crypt.passwordHash(password)).salt,pw.salt);

  const db={guestbook:[],home_admins:[{user_id:'owner-user'}]};const rates=new Map();
  class Query {
    constructor(table){this.table=table;this.filters=[];this.columns='*';this.mode='read';this.offset=0;this.end=100000;}
    select(columns){this.columns=columns;return this;}
    eq(k,v){this.filters.push([k,v]);return this;}
    order(){return this;}
    range(start,end){this.offset=start;this.end=end;return this;}
    insert(input){this.mode='insert';this.input=input;return this;}
    update(input){this.mode='update';this.input=input;return this;}
    delete(){this.mode='delete';return this;}
    maybeSingle(){return this.execute().then(result=>({...result,data:result.data?.[0]??null}));}
    then(resolve,reject){return this.execute().then(resolve,reject);}
    async execute(){
      const table=db[this.table];if(!table)return {data:null,error:new Error('unknown table')};
      const matches=row=>this.filters.every(([key,value])=>row[key]===value);
      if(this.mode==='insert'){const now=new Date().toISOString();table.unshift({...this.input,created_at:now,updated_at:now,reply:this.input.reply??null});return {data:null,error:null};}
      if(this.mode==='update'){for(const row of table)if(matches(row))Object.assign(row,this.input);return {data:null,error:null};}
      if(this.mode==='delete'){db[this.table]=table.filter(row=>!matches(row));return {data:null,error:null};}
      let rows=table.filter(matches).slice(this.offset,this.end+1).map(row=>({...row}));
      if(this.columns!=='*'){const columns=this.columns.split(',');rows=rows.map(row=>Object.fromEntries(columns.map(c=>[c,row[c]])));}
      return {data:rows,error:null};
    }
  }
  const env={SUPABASE_URL:'https://test.supabase.co',HOME_SUPABASE_SECRET_KEY:'test-secret',HOME_ENCRYPTION_KEY:key,HOME_ALLOWED_ORIGINS:'https://home.test',HOME_TURNSTILE_SECRET_KEY:'turnstile-secret'};
  const captchaTokens=new Map();let captchaCount=0;let captchaOffline=false;
  const issueCaptcha=(action,hostname='home.test')=>{const token=`test-token-${++captchaCount}`;captchaTokens.set(token,{success:true,action,hostname});return token;};
  globalThis.fetch=async(url,options)=>{
    assert.equal(url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    if(captchaOffline)throw new Error('Mock provider outage');
    const input=JSON.parse(options.body);assert.equal(input.secret,'turnstile-secret');
    const result=captchaTokens.get(input.response)??{success:false};captchaTokens.delete(input.response);
    return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
  };
  let handler;
  globalThis.Deno={env:{get:k=>env[k]},serve:fn=>{handler=fn;}};
  globalThis.__guestbookTestClient=()=>({
    from:table=>new Query(table),
    auth:{getUser:async token=>({data:{user:token==='owner-token'?{id:'owner-user'}:token==='visitor-token'?{id:'visitor-user'}:null},error:null})},
    rpc:async(_name,args)=>{const hits=(rates.get(args.p_key)??0)+1;rates.set(args.p_key,hits);return {data:hits<=args.p_max,error:null};},
  });
  const handlerSource=(await readFile(new URL('../supabase/functions/guestbook/index.ts',import.meta.url),'utf8'))
    .replace(/import \{ createClient \} from '[^']+';/,"const createClient=globalThis.__guestbookTestClient;")
    .replace("'./crypto.ts'","'./crypto.mjs'");
  await writeFile(path.join(temp,'handler.mjs'),transpile(handlerSource));
  await import(pathToFileURL(path.join(temp,'handler.mjs')).href);
  const request=async(input,token='',origin='https://home.test',ip='127.0.0.1')=>{
    if(['create','read'].includes(input.action)&&!Object.hasOwn(input,'captcha_token'))input={...input,captcha_token:issueCaptcha(`guestbook_${input.action}`)};
    const headers={'Content-Type':'application/json',Origin:origin,'x-forwarded-for':ip};if(token)headers.Authorization=`Bearer ${token}`;
    const res=await handler(new Request('https://test.supabase.co/functions/v1/guestbook',{method:'POST',headers,body:JSON.stringify(input)}));
    return {status:res.status,data:await res.json()};
  };
  let res=await request({action:'create',nickname:'방문자',body:'공개되지 않는 본문',is_secret:true,password});assert.equal(res.status,201);
  const entryId=res.data.id;const stored=db.guestbook[0];assert.equal(stored.body,null);assert.equal(stored.reply,null);assert.ok(stored.encrypted_payload);assert.equal(JSON.stringify(stored).includes('공개되지 않는 본문'),false);assert.equal(JSON.stringify(stored).includes(password),false);
  res=await request({action:'list'});assert.equal(res.status,200);assert.equal(res.data.entries[0].body,null);assert.equal('password_hash' in res.data.entries[0],false);assert.equal('encrypted_payload' in res.data.entries[0],false);
  res=await request({action:'read',id:entryId,password:'incorrect phrase'});assert.equal(res.status,403);assert.equal(JSON.stringify(res.data).includes('공개되지 않는 본문'),false);
  res=await request({action:'read',id:entryId,password});assert.equal(res.status,200);assert.equal(res.data.entry.body,'공개되지 않는 본문');
  // No client widget, fabricated tokens, other actions/hosts, replay and provider failures must fail closed.
  const rowsBefore=db.guestbook.length;
  for(const captcha_token of ['', 'fabricated',issueCaptcha('guestbook_read'),issueCaptcha('guestbook_create','untrusted.test')]){
    assert.equal((await request({action:'create',nickname:'bot',body:'bad',captcha_token})).status,403);
  }
  assert.equal(db.guestbook.length,rowsBefore);
  for(const captcha_token of ['', 'fabricated',issueCaptcha('guestbook_create'),issueCaptcha('guestbook_read','untrusted.test')]){
    const result=await request({action:'read',id:entryId,password,captcha_token});assert.equal(result.status,403);assert.equal(JSON.stringify(result.data).includes('공개되지 않는 본문'),false);
  }
  const reusable=issueCaptcha('guestbook_read');
  assert.equal((await request({action:'read',id:entryId,password,captcha_token:reusable})).status,200);
  assert.equal((await request({action:'read',id:entryId,password,captcha_token:reusable})).status,403);
  captchaOffline=true;assert.equal((await request({action:'read',id:entryId,password})).status,503);captchaOffline=false;
  for(const token of ['','visitor-token','invalid-token']){
    assert.equal((await request({action:'admin_list'},token)).status,403);
    assert.equal((await request({action:'backup'},token)).status,403);
    assert.equal((await request({action:'reply',id:entryId,reply:'무단 답글'},token)).status,403);
    assert.equal((await request({action:'delete',id:entryId},token)).status,403);
  }
  res=await request({action:'reply',id:entryId,reply:'집주인의 비밀 답글'},'owner-token');assert.equal(res.status,200);assert.equal(db.guestbook[0].reply,null);
  res=await request({action:'read',id:entryId,password});assert.equal(res.data.entry.reply,'집주인의 비밀 답글');
  res=await request({action:'list'});assert.equal(res.data.entries[0].reply,null);
  for(let n=0;n<205;n++)db.guestbook.push({id:crypto.randomUUID(),nickname:'public',website:null,is_secret:false,body:`public ${n}`,reply:null,created_at:'2026-10-07',updated_at:'2026-10-07'});
  res=await request({action:'backup'},'owner-token');assert.equal(res.status,200);assert.equal(res.data.entries.length,206);assert.equal(res.data.entries[0].body,'공개되지 않는 본문');assert.equal('password_hash' in res.data.entries[0],false);
  res=await request({action:'read',id:entryId,password:'bad'},'','https://home.test','192.0.2.2');assert.equal(res.status,403);
  for(let n=0;n<4;n++)assert.equal((await request({action:'read',id:entryId,password:'bad'},'','https://home.test','192.0.2.2')).status,403);
  assert.equal((await request({action:'read',id:entryId,password},'','https://home.test','192.0.2.2')).status,429,'Guessing attempts must be bounded');
  assert.equal((await request({action:'list'},'','https://untrusted.test')).status,403);
  assert.equal((await request({action:'backup'},'','')).status,403,'Origin absence does not bypass owner authentication');
  rates.set(`read-entry-all:${entryId}`,100);
  assert.equal((await request({action:'read',id:entryId,password},'','https://home.test','198.51.100.10')).status,429,'Changing IP cannot bypass the entry-wide limit');
  rates.delete(`read-entry-all:${entryId}`);
  rates.set('read-global-day',2000);
  assert.equal((await request({action:'read',id:entryId,password},'','https://home.test','198.51.100.11')).status,429,'Changing IP cannot bypass the site-wide limit');
  rates.delete('read-global-day');
  const wrongType=await handler(new Request('https://test.supabase.co/functions/v1/guestbook',{method:'POST',headers:{Origin:'https://home.test','Content-Type':'text/plain'},body:'{}'}));assert.equal(wrongType.status,415);
  const largeBody=await handler(new Request('https://test.supabase.co/functions/v1/guestbook',{method:'POST',headers:{Origin:'https://home.test','Content-Type':'application/json'},body:JSON.stringify({action:'create',body:'x'.repeat(12001)})}));assert.equal(largeBody.status,413);
  assert.equal((await request({action:'create',nickname:'x',body:'y',is_secret:true,password:'short'},'','https://home.test','192.0.2.3')).status,400);
  assert.equal((await request({action:'create',nickname:'x',body:'y',website:'javascript:alert(1)'},'','https://home.test','192.0.2.4')).status,400);
  assert.equal((await request({action:'delete',id:entryId},'owner-token')).status,200);
  assert.equal(db.guestbook.some(row=>row.id===entryId),false);
  console.log('Security checks passed: AES-GCM integrity/ID binding, salted password verification, secret redaction, owner-only actions, complete backup, attempt limits, origin/URL validation, server-side CAPTCHA validation (missing/forged/wrong action/wrong hostname/replayed tokens and outage).');
} finally {
  globalThis.fetch=originalFetch;
  delete globalThis.Deno;delete globalThis.__guestbookTestClient;
  await rm(temp,{recursive:true,force:true});
}
