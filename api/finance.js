import { configuration,state,submit,approve,link,publicRecord } from '../lib/service.js';
import { allow,actor,RuleError } from '../lib/rules.js';
import { getRecord } from '../lib/database.js';
import { deliver } from '../lib/integrations.js';
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  try {
    if(req.method==='GET' && req.query.action==='config') return res.status(200).json(configuration());
    const id=req.headers['x-demo-role']; actor(id);
    if(req.method==='GET') return res.status(200).json(await state(id));
    if(req.method!=='POST') throw new RuleError('Method not allowed.',405);
    const input=typeof req.body==='string' ? JSON.parse(req.body) : req.body;
    let result;
    if(input.action==='submit') result=publicRecord(await submit(id,input.transaction));
    else if(input.action==='approve') {
      if(input.fault && !['sheets','telegram'].includes(input.fault)) throw new RuleError('Invalid integration test.');
      result=await approve(id,input.reference,input.decision,input.fault);
    } else if(input.action==='link') result=await link(id,input);
    else if(input.action==='retry') {
      const r=await getRecord(input.reference); const who=actor(id);
      if(who.role!=='manager' && r.employee_id!==id) throw new RuleError('You cannot access this record.',403);
      result=publicRecord(await deliver(r.reference,{receipt:r.receipt_status==='failed'}),who.role==='manager');
    } else throw new RuleError('Unknown action.');
    return res.status(200).json({ok:true,result});
  } catch(error) {
    const status=error instanceof RuleError ? error.status : 500;
    return res.status(status).json({error:error instanceof RuleError ? error.message : 'The request could not be completed. Refresh to check whether it saved, then retry if needed.'});
  }
}
