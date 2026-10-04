import { db, getRecord, recipient, rpc } from './database.js';
import { actor, allow, submission, decision, totals, EMPLOYEES, RuleError } from './rules.js';
import { deliver } from './integrations.js';
export function publicRecord(r, manager=false) {
  const { origin_chat_id,delivery_lease_token,delivery_lease_until,...rest }=r;
  return {...rest, has_telegram_recipient:Boolean(origin_chat_id)};
}
export async function state(id) {
  const employee=actor(id);
  const manager=employee.role==='manager';
  // Filter on the server before returning records. Employee responses omit company totals and account links.
  const records=await db(`transactions?${manager ? '' : `employee_id=eq.${id}&`}order=submitted_at.asc`);
  const result={employee,records:records.map(r=>publicRecord(r,manager))};
  if(manager) {
    result.totals=totals(records);
    result.accounts=await db('telegram_accounts?order=started_at.desc');
    const refs=['S01','S02','S03','S04','S05','E01','E02','E03','E04','E05','E06','E07'];
    const assignment=records.filter(r=>refs.includes(r.reference));
    result.assignment={count:assignment.length,totals:totals(assignment)};
  }
  return result;
}
export async function submit(id,input,source='website',chat=null) {
  let record=submission(id,input,source,chat);
  if(source==='website') record.origin_chat_id=await recipient(record);
  record=await rpc('save_transaction',{p_record:record});
  return deliver(record.reference,{notify:false,receipt:source==='telegram'});
}
export async function approve(id,reference,input,fault=null) {
  allow(id,'manager');
  const record=await getRecord(reference);
  const patch=decision(id,record,input);
  if(!patch) return publicRecord(record,true);
  const result=await rpc('approve_transaction',{p_reference:reference,p_actor:id,p_patch:patch});
  if(!result.changed) return publicRecord(result.record,true);
  return publicRecord(await deliver(reference,{fault}),true);
}
export async function link(id,input) {
  allow(id,'manager');
  const {user_id,employee_id}=input;
  if(!/^\d+$/.test(String(user_id))) throw new RuleError('Choose a Telegram user who has started the bot.');
  const account=(await db(`telegram_accounts?user_id=eq.${encodeURIComponent(user_id)}&limit=1`))[0];
  if(!account) throw new RuleError('That user must start the bot before being linked.');
  if(employee_id) actor(employee_id);
  return db(`telegram_accounts?user_id=eq.${encodeURIComponent(user_id)}`,{method:'PATCH',body:JSON.stringify({employee_id:employee_id || null,linked_at:new Date().toISOString()})});
}
export const configuration=()=>({
  name:process.env.STUDENT_NAME || 'Bogdans_Avanesovs',
  bot:`https://t.me/${(process.env.TELEGRAM_BOT_USERNAME || 'BogdansFriendsIncludedBot').replace(/^@/,'')}`,
  sheets:process.env.GOOGLE_SPREADSHEET_ID ? `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SPREADSHEET_ID}/edit` : null,
  github:process.env.GITHUB_REPOSITORY_URL || 'https://github.com/bogdansavanesovs78/friends-included-assignment-4',
  employees:EMPLOYEES,
  ready:{database:Boolean(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY),telegram:Boolean(process.env.TELEGRAM_BOT_TOKEN&&process.env.TELEGRAM_WEBHOOK_SECRET),sheets:Boolean(process.env.GOOGLE_SPREADSHEET_ID&&process.env.GOOGLE_PRIVATE_KEY&&process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL)}
});
