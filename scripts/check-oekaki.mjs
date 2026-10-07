import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
const temp=await mkdtemp(join(tmpdir(),'oekaki-check-'));
const transpile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
try {
  const source=await readFile(new URL('../src/oekaki-transfer.ts',import.meta.url),'utf8');
  await writeFile(join(temp,'transfer.mjs'),transpile(source));
  const {acceptsDrawingMessage,drawingFile}=await import(pathToFileURL(join(temp,'transfer.mjs')));
  const frame={},origin='https://home.test',session='draft-session';
  const message={origin,source:frame,data:{type:'oekaki-complete',session}};
  assert.equal(acceptsDrawingMessage(message,frame,origin,session),true);
  assert.equal(acceptsDrawingMessage({...message,origin:'https://evil.test'},frame,origin,session),false);
  assert.equal(acceptsDrawingMessage({...message,source:{}},frame,origin,session),false);
  assert.equal(acceptsDrawingMessage(message,frame,origin,'another-session'),false);
  assert.equal(acceptsDrawingMessage(message,null,origin,session),false);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/RZkAAAAASUVORK5CYII=','base64');
  const blob=new Blob([png],{type:'image/png'});
  assert.equal((await drawingFile(blob)).type,'image/png');
  await assert.rejects(drawingFile(new Blob([png],{type:'image/svg+xml'})));
  await assert.rejects(drawingFile(new Blob(['fake png'],{type:'image/png'})));
  await assert.rejects(drawingFile(new Blob([new Uint8Array(10*1024*1024+1)],{type:'image/png'})));
  const oversized=Buffer.from(png);oversized.writeUInt32BE(1601,16);
  await assert.rejects(drawingFile(new Blob([oversized],{type:'image/png'})));

  const messages=[],button={disabled:true},listeners={},timers=new Map();let seq=0,saves=0;
  const parent={postMessage:(data,target)=>messages.push({data,target})};
  const context=vm.createContext({document:{getElementById:()=>button},parent,location:{origin},
    window:{oekakiReady:Promise.resolve(),addEventListener:(name,handler)=>listeners[name]=handler},
    composite:()=>{},saveLocal:()=>saves++,canvas:{toBlob:callback=>callback(blob)},drawing:false,
    toast:()=>{},setTimeout:callback=>{timers.set(++seq,callback);return seq;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(await readFile(new URL('../public/oekaki/bridge.js',import.meta.url),'utf8'),context);
  const event=(data,from=parent,fromOrigin=origin)=>({data,source:from,origin:fromOrigin});
  await listeners.message(event({type:'oekaki-init',session},{},origin));assert.equal(button.disabled,true);
  await listeners.message(event({type:'oekaki-init',session},parent,'https://evil.test'));assert.equal(button.disabled,true);
  await listeners.message(event({type:'oekaki-init',session}));assert.equal(button.disabled,false);
  await button.onclick();assert.equal(button.disabled,true);assert.equal(saves,1);
  assert.equal(messages.at(-1).data.blob,blob);assert.equal(messages.at(-1).target,origin);
  const count=messages.length;await button.onclick();assert.equal(messages.length,count,'Double clicks must not submit duplicate drawings');
  await listeners.message(event({type:'oekaki-result',session,ok:false}));assert.equal(button.disabled,false);
  await button.onclick();await listeners.message(event({type:'oekaki-result',session,ok:true}));assert.equal(button.disabled,false);

  // Check drawing -> upload -> post -> reload using the homepage's real demo adapter.
  let adapter=await readFile(new URL('../src/data.ts',import.meta.url),'utf8');
  adapter=adapter.replace("import { createClient } from '@supabase/supabase-js';",'const createClient=()=>globalThis.__mockSupabase;').replaceAll('import.meta.env','({})');
  await writeFile(join(temp,'data.mjs'),transpile(adapter));
  const memory=new Map();globalThis.localStorage={getItem:key=>memory.get(key)??null,setItem:(key,v)=>memory.set(key,v)};
  const encodings=[];
  globalThis.createImageBitmap=async()=>({width:640,height:480,close(){}});
  globalThis.document={createElement:()=>({getContext:()=>({drawImage(){}}),toBlob:(callback,type)=>{encodings.push(type);callback(new Blob([png],{type}));}})};
  globalThis.FileReader=class{async readAsDataURL(value){this.result=`data:${value.type};base64,${Buffer.from(await value.arrayBuffer()).toString('base64')}`;this.onload();}};
  const data=await import(pathToFileURL(join(temp,'data.mjs')));
  const file=await drawingFile(blob);const image=await data.uploadImage(file,true);
  assert.equal(encodings.at(-1),'image/png');assert.ok(image.startsWith('data:image/png;'));
  const post={kind:'art',title:'오에카키 테스트',body:'직접 그린 그림',status:'public',tags:['낙서'],image_path:image,series_title:null,chapter_no:null};
  await data.savePost(post,'oekaki-test');
  assert.equal((await data.listPosts()).find(p=>p.id==='oekaki-test').image_path,image);
  await data.uploadImage(file);assert.equal(encodings.at(-1),'image/webp');
  // Connected mode checks PNG content type/path and leaves publishing to existing RLS.
  let uploaded;
  globalThis.__mockSupabase={auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})},storage:{from:bucket=>{assert.equal(bucket,'artwork');return {upload:async(path,body,options)=>{uploaded={path,body,options};return {error:null};}}}}};
  adapter=adapter.replace('({})',"({VITE_SUPABASE_URL:'https://sample.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_sample'})");
  // Both environment reads must use the same connected settings.
  adapter=adapter.replace('({})',"({VITE_SUPABASE_URL:'https://sample.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_sample'})");
  await writeFile(join(temp,'connected.mjs'),transpile(adapter));
  const connected=await import(pathToFileURL(join(temp,'connected.mjs')));
  const path=await connected.uploadImage(file,true);assert.match(path,/^owner\/.+\.png$/);assert.equal(uploaded.options.contentType,'image/png');
  globalThis.__mockSupabase.auth.getUser=async()=>({data:{user:null},error:null});
  await assert.rejects(connected.uploadImage(file,true),/로그인/);
  const headers=await readFile(new URL('../public/_headers',import.meta.url),'utf8');
  assert.ok(headers.includes("frame-src 'self' https://challenges.cloudflare.com"));
  assert.ok(headers.includes("frame-ancestors 'none'"));assert.ok(headers.includes("frame-ancestors 'self'"));
  console.log('PASS: drawing transfer origin/source/session, PNG validation, duplicate/retry handling, demo publish/reload, PNG storage path/type, login gate.');
} finally {await rm(temp,{recursive:true,force:true});}
