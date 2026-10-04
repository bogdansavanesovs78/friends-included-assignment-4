import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {submit,approve,state} from '../lib/service.js';
import {deliver,synchronize} from '../lib/integrations.js';
import finance from '../api/finance.js';
import bot from '../api/telegram.js';
import {RuleError} from '../lib/rules.js';

test('Processing routes, interrupted deliveries, fixed Sheets rows and bot-update deduplication',async()=>{
 const originalFetch=globalThis.fetch,originalEnv={...process.env};
 const records=new Map(),updates=new Set(),accounts=new Map([['123',{user_id:'123',chat_id:'123',employee_id:'richard'}]]),sheetWrites=[],messages=[];
 let sheetDown=false,telegramDown=false,sequence=2;
 Object.assign(process.env,{SUPABASE_URL:'https://database.test',SUPABASE_SERVICE_ROLE_KEY:'test-key',TELEGRAM_BOT_TOKEN:'test-token',TELEGRAM_WEBHOOK_SECRET:'test-secret',GOOGLE_SPREADSHEET_ID:'test-sheet',GOOGLE_SERVICE_ACCOUNT_EMAIL:'test@example.invalid',GOOGLE_PRIVATE_KEY:generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'})});
 globalThis.fetch=async(url,options={})=>{
  const u=new URL(url),body=typeof options.body==='string'?JSON.parse(options.body):null;
  const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
  if(u.hostname==='oauth2.googleapis.com')return reply({access_token:'test-access'});
  if(u.hostname==='sheets.googleapis.com'){if(sheetDown)return reply({},503);sheetWrites.push(body.data[1]);return reply({});}
  if(u.hostname==='api.telegram.org'){if(telegramDown)return reply({ok:false},403);messages.push(body);return reply({ok:true});}
  const endpoint=u.pathname.replace('/rest/v1/','');
  if(endpoint==='rpc/save_transaction'){if(records.has(body.p_record.reference))return reply({code:'23505'},409);const r={...body.p_record,submitted_at:new Date().toISOString(),version:1,sheet_row:sequence++,receipt_status:body.p_record.source==='telegram'?'pending':'not_required'};records.set(r.reference,r);return reply(r);}
  if(endpoint==='rpc/approve_transaction'){const r=records.get(body.p_reference);if(['approved','allocated'].includes(r.status))return reply({changed:false,record:r});Object.assign(r,body.p_patch,{version:r.version+1});return reply({changed:true,record:r});}
  if(endpoint==='rpc/claim_delivery'){const r=records.get(body.p_reference);if(r.delivery_lease_token)return reply([]);r.delivery_lease_token=body.p_token;return reply([r]);}
  if(endpoint==='rpc/release_delivery'){records.get(body.p_reference).delivery_lease_token=null;return reply(null);}
  if(endpoint==='transactions'){
   let rows=[...records.values()];for(const field of ['reference','employee_id','version'])if(u.searchParams.has(field))rows=rows.filter(r=>String(r[field])===u.searchParams.get(field).slice(3));
   if(options.method==='PATCH')rows.forEach(r=>Object.assign(r,body));return reply(rows);
  }
  if(endpoint==='telegram_accounts'){
   let rows=[...accounts.values()];for(const field of ['user_id','employee_id'])if(u.searchParams.has(field))rows=rows.filter(r=>r[field]===u.searchParams.get(field).slice(3));
   if(options.method==='POST'){accounts.set(body.user_id,body);rows=[body];}if(options.method==='PATCH')rows.forEach(r=>Object.assign(r,body));return reply(rows);
  }
  if(endpoint==='telegram_updates'){if(options.method==='POST'){if(updates.has(body.update_id))return reply({code:'23505'},409);updates.add(body.update_id);}return reply([]);}
  throw new Error(`Unexpected mocked endpoint ${endpoint}`);
 };
 const call=async(handler,req)=>{let data,status;const res={setHeader(){},status(v){status=v;return this;},json(v){data=v;return this;}};await handler({headers:{},query:{},...req},res);return{data,status};};
 try {
  const denied=await call(finance,{method:'POST',headers:{'x-demo-role':'kevin'},body:{action:'submit',transaction:{kind:'sale'}}});assert.equal(denied.status,403);assert.equal(records.size,0);
  sheetDown=true;
  let r=await submit('richard',{kind:'sale',reference:'X1',customer:'Test',description:'Delivered',project:'A',amount:'10',split:[50,30,20]},'telegram','123');
  assert.equal(r.sync_status,'failed');assert.equal(records.size,1);assert.equal(messages.length,1);
  sheetDown=false;r=await deliver('X1');assert.equal(r.sync_status,'synced');assert.equal(records.size,1);
  await assert.rejects(submit('richard',{kind:'sale',reference:'X1',customer:'Duplicate',description:'Delivered',project:'A',amount:'10',split:[50,30,20]}),RuleError);
  accounts.get('123').employee_id='kevin'; // Original bot sale must retain Richard and original destination.
  telegramDown=true;r=await approve('svetlana','X1',{split:[20,30,50]});assert.equal(r.status,'approved');assert.equal(r.notification_status,'failed');assert.equal(r.employee_id,'richard');
  telegramDown=false;r=await deliver('X1');assert.equal(r.notification_status,'sent');assert.equal(messages.at(-1).chat_id,'123');assert.match(messages.at(-1).text,/changed/);
  const count=messages.length,writes=sheetWrites.length;await approve('svetlana','X1',{split:[100,0,0]});assert.equal(messages.length,count);assert.equal(sheetWrites.length,writes);assert.equal(records.size,1);
  assert.equal(new Set(sheetWrites.map(v=>v.range)).size,1);assert.equal(sheetWrites.at(-1).values[0][10],'20%');
  await submit('anastasia',{kind:'sale',reference:'X2',customer:'Other',description:'Delivered',project:'B',amount:'1',split:[0,100,0]});
  const employee=await state('richard');assert.deepEqual(employee.records.map(r=>r.reference),['X1']);assert.equal(employee.totals,undefined);assert.equal(employee.accounts,undefined);assert.equal(employee.records[0].origin_chat_id,undefined);
  const deniedApprove=await call(finance,{method:'POST',headers:{'x-demo-role':'richard'},body:{action:'approve',reference:'X2',decision:{split:[0,100,0]}}});assert.equal(deniedApprove.status,403);assert.equal(records.get('X2').status,'pending');
  const webhook={method:'POST',headers:{'x-telegram-bot-api-secret-token':'test-secret'},body:{update_id:77,message:{from:{id:123},chat:{id:123,type:'private'},text:'/expense BOT1 | Paid taxi | Travel | 3 | A'}}};
  const beforeMessages=messages.length;assert.equal((await call(bot,webhook)).status,200);assert.equal((await call(bot,webhook)).status,200);assert.equal(messages.length,beforeMessages+1);assert.equal(records.get('BOT1').employee_id,'kevin');
  webhook.body={...webhook.body,update_id:78};assert.equal((await call(bot,webhook)).status,200);assert.equal((await call(bot,webhook)).status,200);assert.equal(messages.length,beforeMessages+2); // one duplicate refusal, no repeated replies
  process.env.GOOGLE_SPREADSHEET_ID='1AZ__P96ArJzLLTs6kGVPPIDS8229bhYcKgGu6I8O7wk';
  await assert.rejects(synchronize(records.get('X1')),/read-only/);
 } finally {globalThis.fetch=originalFetch;process.env=originalEnv;}
});
