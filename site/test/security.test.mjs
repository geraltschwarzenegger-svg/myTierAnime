import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import worker, { __test } from '../src/index.js';
import { makeD1 } from './d1.mjs';
import { WEB_CSP } from '../src/security-policy.mjs';
const schema = new URL('../schema.sql',import.meta.url);
const envOf = extra => ({DB:makeD1(schema),SESSION_SECRET:'a-local-test-signing-key-with-32-bytes-minimum',DEV_ECHO_CODE:'1',ASSETS:{fetch:async()=>new Response('<!doctype html><title>test</title>',{headers:{'content-type':'text/html'}})},...extra});
const ctx={waitUntil: p=>p.catch(()=>{})};
async function call(env, method, path, body, opts={}) {
 const url=(opts.originUrl||'https://localhost')+path;
 const headers={'content-type':'application/json','x-atl-request':'1',...opts.headers};
 const request=new Request(url,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
 const res=await worker.fetch(request,env,ctx);
 return {res,status:res.status,body:await res.json().catch(()=>null)};
}
async function codeFor(env,email='owner@example.test') {const r=await call(env,'POST','/api/auth/request',{email});assert.equal(r.status,200);assert.match(r.body.devCode,/^\d{6}$/);return r.body.devCode;}
async function signIn(env,email='owner@example.test') {const code=await codeFor(env,email);const r=await call(env,'POST','/api/auth/verify',{email,code});assert.equal(r.status,200);return r.res.headers.get('set-cookie').split(';')[0];}
const fixture=()=>({schema:4,nextUid:2,tiers:[{id:'S',label:'Шедевры',items:[{uid:1,name:'Фрирен',cover:'',watched:[{label:'',date:'11.10.2026'}]}]}]});

test('CSRF: foreign Origin, opaque Origin and missing custom header cannot mutate data',async()=>{
 const env=envOf();
 for(const headers of [{origin:'https://evil.example'},{origin:'null'},{'x-atl-request':''},{'sec-fetch-site':'cross-site'},{origin:'https://sibling.localhost'}]) {
  assert.equal((await call(env,'POST','/api/auth/request',{email:'target@example.test'},{headers})).status,403);
 }
 assert.equal(env.DB._raw.prepare('SELECT COUNT(*) n FROM login_codes').get().n,0);
 assert.equal((await call(env,'POST','/api/auth/request',{email:'target@example.test'},{headers:{origin:'https://localhost','sec-fetch-site':'same-origin'}})).status,200);
});

test('JSON content type and valid object are required for mutation',async()=>{
 const env=envOf();
 assert.equal((await call(env,'POST','/api/auth/request',{email:'a@example.test'},{headers:{'content-type':'text/plain'}})).status,415);
 for(const body of [null,[],7,'email']) assert.equal((await call(env,'POST','/api/auth/request',body)).status,400);
 const res=await worker.fetch(new Request('https://localhost/api/auth/request',{method:'POST',headers:{'content-type':'application/json','x-atl-request':'1'},body:'{broken'}),env,ctx);assert.equal(res.status,400);
});

test('bodyless logout represented as an empty Worker stream revokes the session',async()=>{
 const env=envOf();const cookie=await signIn(env);
 const request=new Request('https://localhost/api/auth/logout',{method:'POST',headers:{'x-atl-request':'1',cookie},body:new ReadableStream({start(c){c.close();}}),duplex:'half'});
 assert.equal((await worker.fetch(request,env,ctx)).status,200);
 assert.equal((await call(env,'GET','/api/me',undefined,{headers:{cookie}})).body.me,null);
});

test('production host never exposes development login codes',async()=>{
 const env=envOf();const r=await call(env,'POST','/api/auth/request',{email:'a@example.test'},{originUrl:'https://production.example'});
 assert.equal(r.status,200);assert.equal(r.body.devCode,undefined);assert.equal(r.body.sent,false);
});

test('missing or short signing key fails closed without issuing a code or session',async()=>{
 for(const secret of [undefined,'short']) {
  const env=envOf({SESSION_SECRET:secret});const r=await call(env,'POST','/api/auth/request',{email:'a@example.test'});
  assert.equal(r.status,503);assert.equal(r.res.headers.get('set-cookie'),null);assert.equal(env.DB._raw.prepare('SELECT COUNT(*) n FROM login_codes').get().n,0);
 }
});

test('rate limit is atomic under 30 simultaneous requests',async()=>{
 const env=envOf();const results=await Promise.all(Array.from({length:30},()=>__test.rateLimit(env,'concurrent',5,3600000)));
 assert.equal(results.filter(r=>r.ok).length,5);assert.equal(env.DB._raw.prepare('SELECT count FROM rate_limit WHERE key=?').get('concurrent').count,5);
 assert.ok(results.filter(r=>!r.ok).every(r=>Number.isInteger(r.retryAfter)&&r.retryAfter>0));
});

test('parallel verification cannot issue two sessions from the same code',async()=>{
 const env=envOf();const email='one@example.test';const code=await codeFor(env,email);
 const results=await Promise.all(Array.from({length:4},()=>call(env,'POST','/api/auth/verify',{email,code})));
 assert.equal(results.filter(r=>r.status===200).length,1);
 assert.equal(env.DB._raw.prepare('SELECT COUNT(*) n FROM sessions').get().n,1);
 assert.equal(env.DB._raw.prepare('SELECT COUNT(*) n FROM users').get().n,1);
 assert.equal(env.DB._raw.prepare('SELECT COUNT(*) n FROM login_codes').get().n,0);
 assert.notEqual((await call(env,'POST','/api/auth/verify',{email,code})).status,200);
});

test('parallel wrong codes reserve at most five attempts',async()=>{
 const env=envOf();const email='wrong@example.test';const correct=await codeFor(env,email);const code=correct==='000000'?'000001':'000000';
 const results=await Promise.all(Array.from({length:15},()=>call(env,'POST','/api/auth/verify',{email,code})));
 assert.equal(results.filter(r=>r.status===400).length,5);assert.equal(results.filter(r=>r.status===429).length,10);
 assert.equal(env.DB._raw.prepare('SELECT attempts FROM login_codes').get().attempts,5);
 assert.equal((await call(env,'POST','/api/auth/verify',{email,code:correct})).status,429);
});

test('logout revokes captured cookie but retains a different device session',async()=>{
 const env=envOf();const a=await signIn(env);const b=await signIn(env);
 const headers={cookie:a};assert.equal((await call(env,'POST','/api/auth/logout',undefined,{headers})).status,200);
 assert.equal((await call(env,'GET','/api/me',undefined,{headers})).body.me,null);
 assert.equal((await call(env,'GET','/api/me',undefined,{headers:{cookie:b}})).body.me.email,'owner@example.test');
 assert.equal(env.DB._raw.prepare('SELECT COUNT(*) n FROM sessions').get().n,1);
});

test('expired server session and cookie with an appended suffix are rejected',async()=>{
 const env=envOf();const cookie=await signIn(env);
 assert.equal((await call(env,'GET','/api/me',undefined,{headers:{cookie:cookie+'.extra'}})).body.me,null);
 env.DB._raw.prepare('UPDATE sessions SET expires_at=?').run(Date.now()-1);
 assert.equal((await call(env,'GET','/api/me',undefined,{headers:{cookie}})).body.me,null);
});

test('session cookie is HttpOnly, Secure, SameSite and limited to 14 days',async()=>{
 const env=envOf();const code=await codeFor(env);const r=await call(env,'POST','/api/auth/verify',{email:'owner@example.test',code});
 assert.match(r.res.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax; Max-Age=1209600$/);
});

test('request size counts UTF-8 bytes, before validation or storing the list',async()=>{
 const env=envOf();const cookie=await signIn(env);const state=fixture();state.tiers[0].items[0].name='Ж'.repeat(270000);
 const r=await call(env,'PUT','/api/list',{state},{headers:{cookie}});assert.equal(r.status,413);
 assert.equal(env.DB._raw.prepare('SELECT COUNT(*) n FROM lists').get().n,0);
});

test('oversized streaming body is cancelled before it is buffered completely',async()=>{
 const env=envOf();let cancelled=false;
 const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(9000));},cancel(){cancelled=true;}});
 const request=new Request('https://localhost/api/auth/request',{method:'POST',headers:{'content-type':'application/json','x-atl-request':'1'},body,duplex:'half'});
 const res=await worker.fetch(request,env,ctx);assert.equal(res.status,413);assert.equal(cancelled,true);
});

test('invalid state cannot overwrite a valid collection',async()=>{
 const env=envOf();const cookie=await signIn(env);const headers={cookie};
 assert.equal((await call(env,'PUT','/api/list',{state:fixture()},{headers})).status,200);
 for(const edit of [s=>s.tiers[0].items.push({...s.tiers[0].items[0]}),s=>s.nextUid=1,s=>s.tiers[0].items[0].watched[0].date='31.02.2026',s=>s.tiers[0].items[0].cover='javascript:alert(1)',s=>s.tiers=Array(9).fill(s.tiers[0])]) {
  const state=fixture();edit(state);assert.equal((await call(env,'PUT','/api/list',{state},{headers})).status,400);
 }
 const saved=await call(env,'GET','/api/list/owner');assert.deepEqual(saved.body.state,fixture());
});

test('published JSON snapshots satisfy the server validation contract',()=>{
 for(const name of ['data.json','anime-tierlist-2026-09-21.json']) {
  const data=JSON.parse(readFileSync(new URL('../../'+name,import.meta.url),'utf8'));
  assert.equal(__test.validateState(data.state),null,name);
 }
});

test('image URLs reject execution schemes, credentials, HTTP and SVG data',()=>{
 for(const value of ['javascript:alert(1)','file:///etc/passwd','http://evil.example/a.png','https://user:pass@host.test/a.jpg','data:text/html;base64,PHNjcmlwdD4=','data:image/svg+xml;base64,PHN2Zz4=','https://evil.example/\nimage']) assert.equal(__test.safeImageUrl(value),'');
 assert.equal(__test.safeImageUrl('https://cover.test/a.webp'),'https://cover.test/a.webp');
 assert.ok(__test.safeImageUrl('data:image/png;base64,aGVsbG8='));
});

test('errors never expose internal database details and keep protective headers',async()=>{
 const env=envOf({DB:{prepare(){throw new Error('PRIVATE_DATABASE_INFO');}}});
 const r=await call(env,'GET','/api/config');assert.equal(r.status,500);assert.equal(r.body.detail,undefined);assert.equal(JSON.stringify(r.body).includes('PRIVATE_DATABASE_INFO'),false);
 assert.equal(r.res.headers.get('x-content-type-options'),'nosniff');assert.equal(r.res.headers.get('x-frame-options'),'DENY');
});

test('HTML, API success and rejected requests have security headers without CORS access',async()=>{
 const env=envOf();
 for(const path of ['/','/api/config','/api/missing']) {
  const res=await worker.fetch(new Request('https://localhost'+path),env,ctx);
  assert.match(res.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.match(res.headers.get('strict-transport-security'),/31536000/);
  assert.equal(res.headers.get('referrer-policy'),'no-referrer');assert.equal(res.headers.get('access-control-allow-origin'),null);
  assert.match(res.headers.get('permissions-policy'),/camera=\(\)/);
 }
});

test('malformed encoded list address returns a client error',async()=>{
 assert.equal((await call(envOf(),'GET','/api/list/%E0%A4%A')).status,400);
});

test('website CSP hashes authorize every actual inline executable script',()=>{
 const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');let scripts=0;
 for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  if(/\bsrc\s*=|\btype\s*=\s*["']application\/json/.test(match[1]))continue;
  const hash=createHash('sha256').update(match[2]).digest('base64');assert.ok(WEB_CSP.includes("'sha256-"+hash+"'"));scripts++;
 }
 assert.ok(scripts>=3);assert.ok(html.includes(WEB_CSP));assert.equal(WEB_CSP.includes('unsafe-eval'),false);assert.match(WEB_CSP,/script-src 'self' 'sha256-/);
 assert.equal(html.includes('cdnjs.cloudflare.com'),false);assert.equal(html.includes('fonts.googleapis.com'),false);
 const js=readFileSync(new URL('../../assets/vendor/html2canvas-1.4.1.min.js',import.meta.url));
 assert.ok(html.includes('sha384-'+createHash('sha384').update(js).digest('base64')));
});

test('feedback GET is read-only; marking read requires same-origin POST and owner access',async()=>{
 const env=envOf();const a=await signIn(env,'alice@example.test');const b=await signIn(env,'bob@example.test');
 await call(env,'POST','/api/feedback',{slug:'alice',body:'Для Alice'});
 await call(env,'POST','/api/feedback',{slug:'bob',body:'Для Bob'},{headers:{'cf-connecting-ip':'203.0.113.99'}});
 const messages=await call(env,'GET','/api/feedback',undefined,{headers:{cookie:a}});
 assert.equal(messages.body.feedback.length,1);assert.equal(env.DB._raw.prepare('SELECT SUM(seen) n FROM feedback').get().n,0);
 const ids=env.DB._raw.prepare('SELECT id FROM feedback').all().map(r=>r.id);
 assert.equal((await call(env,'POST','/api/feedback/read',{ids},{headers:{cookie:a,origin:'https://evil.example'}})).status,403);
 assert.equal((await call(env,'POST','/api/feedback/read',{ids},{headers:{cookie:a}})).status,200);
 const bob=await call(env,'GET','/api/feedback',undefined,{headers:{cookie:b}});
 assert.equal(bob.body.feedback[0].seen,0);
 assert.equal(env.DB._raw.prepare('SELECT SUM(seen) n FROM feedback').get().n,1);
});
