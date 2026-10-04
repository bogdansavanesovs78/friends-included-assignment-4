import test from 'node:test';
import assert from 'node:assert/strict';
import { submission,decision,totals,split,commissions,parseBot,decisionMessage } from '../lib/rules.js';

const sales=[
 ['S01','richard','Olivia Rose','A','1000',[50,30,20]],
 ['S02','anastasia','Daniel King','B','2000',[0,50,50]],
 ['S03','jean','Emma Stonebridge','A','1500',[40,40,20]],
 ['S04','richard','Lucas Green','B','800',[25,25,50]],
 ['S05','richard','Mia Brooks','B','600',[100,0,0]]
];
const expenses=[['E01','120','A'],['E02','80','B'],['E03','100','overhead'],['E04','250','B'],['E05','90','A'],['E06','60','overhead'],['E07','140','A']];
const sale=([reference,id,customer,project,amount,split])=>submission(id,{kind:'sale',reference,customer,project,amount,split,description:'Fictional delivered service'});
const expense=([reference,amount,allocation])=>submission('kevin',{kind:'expense',reference,amount,allocation,category:'Other',description:'Fictional paid expense'});
function approve(records,ref,proposal){const r=records.find(r=>r.reference===ref);const patch=decision('svetlana',r,proposal);if(patch)Object.assign(r,patch);}
test('Both prescribed tests reconcile, preserve pending items, and include extra instructor records',()=>{
 const records=[...sales.slice(0,2).map(sale),...expenses.slice(0,3).map(expense)];
 const before=totals(records);assert.equal(before.result,-30000);assert.equal(before.A.result,0);assert.equal(before.B.result,0);assert.equal(before.commissions,0);
 approve(records,'S01',{split:[50,30,20]});approve(records,'S02',{split:[20,40,40]});approve(records,'E01',{allocation:'A'});approve(records,'E02',{allocation:'A'});
 let t=totals(records);assert.deepEqual([t.A.result,t.B.result,t.result,...t.earned],[70000,180000,240000,9000,11000,10000]);
 records.push(...sales.slice(2).map(sale),...expenses.slice(3).map(expense));
 approve(records,'S03',{split:[20,30,50]});approve(records,'S04',{split:[25,25,50]});approve(records,'E04',{allocation:'B'});approve(records,'E05',{allocation:'B'});
 t=totals(records);assert.deepEqual([t.A.income,t.B.income,t.income,t.commissions,t.overhead,t.unallocated,t.A.result,t.B.result,t.result,...t.earned],[250000,280000,530000,53000,16000,14000,205000,218000,393000,14000,17500,21500]);
 assert.equal(t.A.result+t.B.result-t.overhead-t.unallocated,t.result);
 assert.equal(records.find(r=>r.reference==='S05').status,'pending');assert.equal(records.find(r=>r.reference==='E07').status,'awaiting_allocation');
 const old=structuredClone(t);approve(records,'S03',{split:[100,0,0]});assert.deepEqual(totals(records),old);
 records.push(sale(['INSTRUCTOR_S','richard','Test','A','10',[50,30,20]]),expense(['INSTRUCTOR_E','3','B']));approve(records,'INSTRUCTOR_S',{split:[20,30,50]});approve(records,'INSTRUCTOR_E',{allocation:'B'});
 assert.equal(totals(records).result,393600);
});
test('Invalid roles, amounts and commission proposals are refused before persistence',()=>{
 const input={kind:'sale',reference:'X',customer:'Customer',project:'A',description:'Delivered',amount:'1',split:[50,30,20]};
 assert.throws(()=>submission('kevin',input),/not permitted/);
 assert.throws(()=>decision('richard',sale(sales[0]),{split:[50,30,20]}),/not permitted/);
 for(const amount of [0,'',null,-1,'0.001','1e3'])assert.throws(()=>submission('richard',{...input,amount}));
 assert.throws(()=>split([60,30,20]),/100%/);assert.throws(()=>split([-1,1,100]));assert.throws(()=>split([101,0,0]));
});
test('Commission cents reconcile including tied rounding winners',()=>{
 assert.deepEqual(commissions(15,split([50,50,0])),{pool:2,earned:[1,1,0]});
 assert.deepEqual(commissions(25,split([50,50,0])),{pool:3,earned:[1,2,0]});
 for(let cents=1;cents<1000;cents++) {const c=commissions(cents,split([33.33,33.33,33.34]));assert.equal(c.earned.reduce((a,b)=>a+b),c.pool);}
});
test('Bot parses the same transaction fields and changed decision messages preserve proposals',()=>{
 const input=parseBot('/sale S01 | Olivia Rose | A | Delivered service | 1000 | 50 | 30 | 20');
 const r=submission('richard',input,'telegram','123');assert.equal(r.origin_chat_id,'123');assert.equal(r.employee_id,'richard');
 Object.assign(r,decision('svetlana',r,{split:[20,30,50]}));const message=decisionMessage(r);assert.match(message,/changed/);assert.match(message,/50% → 20%/);assert.match(message,/€100.00/);
 const e=parseBot('/expense E01 | Clothes | materials | 120 | A');assert.equal(submission('kevin',e).category,'Materials');
 assert.throws(()=>parseBot('/sale incomplete'),/fields/);
});
