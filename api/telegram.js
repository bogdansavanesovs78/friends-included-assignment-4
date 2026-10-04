import { timingSafeEqual } from 'node:crypto';
import { db } from '../lib/database.js';
import { submit } from '../lib/service.js';
import { telegram } from '../lib/integrations.js';
import { parseBot,RuleError,EMPLOYEES } from '../lib/rules.js';
const help=`Friends Included finance bot\n\n1. Start this bot.\n2. In the website choose Svetlana → Telegram setup and link your user ID to an employee. You cannot choose your role through this bot.\n3. Submit with these formats (use | between fields):\n\n/sale REF | Customer | A or B | Description | Amount | Richard % | Anastasia % | Jean-Claude %\n\n/expense REF | Description | Materials or Travel or Other | Amount | A or B or overhead\n\nUse /whoami to check your user ID and current link. Sales start pending; all paid expenses count immediately. Manager decisions arrive in this chat.`;
function secretMatches(given,expected) {
  if(!given || !expected) return false;
  const a=Buffer.from(String(given)),b=Buffer.from(expected);
  return a.length===b.length&&timingSafeEqual(a,b);
}
export default async function handler(req,res) {
  if(req.method!=='POST') return res.status(405).json({error:'POST required'});
  if(!secretMatches(req.headers['x-telegram-bot-api-secret-token'],process.env.TELEGRAM_WEBHOOK_SECRET)) return res.status(403).json({error:'Invalid webhook secret'});
  const update=typeof req.body==='string' ? JSON.parse(req.body) : req.body;
  if(!Number.isSafeInteger(update?.update_id)) return res.status(200).json({ok:true});
  // Claim before sending anything. Always acknowledge handled validation errors: no repeated-error storms.
  try { await db('telegram_updates',{method:'POST',body:JSON.stringify({update_id:update.update_id})}); }
  catch(error) { return res.status(error.status===409 ? 200 : 503).json({ok:error.status===409}); }
  const msg=update.message;
  try {
    if(!msg?.from || msg.chat?.type!=='private' || typeof msg.text!=='string') return res.status(200).json({ok:true});
    const user=String(msg.from.id),chat=String(msg.chat.id),text=msg.text.trim();
    let accounts=await db(`telegram_accounts?user_id=eq.${user}&limit=1`);
    if(/^\/start(?:@\w+)?(?:\s|$)/i.test(text)) {
      if(!accounts.length) await db('telegram_accounts',{method:'POST',body:JSON.stringify({user_id:user,chat_id:chat})});
      else await db(`telegram_accounts?user_id=eq.${user}`,{method:'PATCH',body:JSON.stringify({chat_id:chat})});
      await telegram(chat,`${help}\n\nYour Telegram user ID: ${user}.`);
    } else if(/^\/(help|whoami)(?:@\w+)?$/i.test(text)) {
      const employee=EMPLOYEES.find(e=>e.id===accounts[0]?.employee_id);
      await telegram(chat,text.startsWith('/help') ? help : `Your Telegram user ID: ${user}.\nRole: ${employee?.name || 'Unlinked — start the bot and ask the manager to link you in website setup.'}`);
    } else {
      if(!accounts[0]?.employee_id) throw new RuleError('Your Telegram account is unlinked. Start the bot, then have the manager link your user ID in website setup.');
      await submit(accounts[0].employee_id,parseBot(text),'telegram',chat);
    }
  } catch(error) {
    if(msg?.chat?.id) {
      try { await telegram(String(msg.chat.id),error instanceof RuleError ? error.message : 'I could not complete that request. Check the website before submitting again; a saved transaction may still be awaiting delivery.'); } catch { /* Do not retry unsolicited replies. */ }
    }
  } finally {
    try { await db(`telegram_updates?update_id=eq.${update.update_id}`,{method:'PATCH',body:JSON.stringify({status:'handled'})}); } catch { /* Deduplication claim remains intact. */ }
  }
  return res.status(200).json({ok:true});
}
