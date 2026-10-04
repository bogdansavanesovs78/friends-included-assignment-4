import { createSign, randomUUID } from 'node:crypto';
import { db, getRecord, patchRecord, recipient, rpc } from './database.js';
import { EMPLOYEES, decisionMessage, euro, allocationName, RuleError } from './rules.js';
let tokenCache;
export async function telegram(chat, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Telegram bot is not configured.');
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text }), signal: AbortSignal.timeout(10000) });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error('Telegram could not deliver the message. Check the recipient has started and has not blocked the bot.');
}
async function googleToken() {
  if (tokenCache && tokenCache.expires > Date.now()) return tokenCache.token;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!email || !key) throw new Error('Google service account is not configured.');
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const data = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const signature = createSign('RSA-SHA256').update(data).sign(key, 'base64url');
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${data}.${signature}` }), signal: AbortSignal.timeout(10000) });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw new Error('Google authentication failed. Check the server-side service account credentials.');
  tokenCache = { token: result.access_token, expires: Date.now() + 3300000 };
  return tokenCache.token;
}
export const salesHeaders = ['Reference','Submission time','Salesperson','Customer','Project','Description','Amount EUR','Proposed Richard %','Proposed Anastasia %','Proposed Jean-Claude %','Approved Richard %','Approved Anastasia %','Approved Jean-Claude %','Richard commission EUR','Anastasia commission EUR','Jean-Claude commission EUR','Status'];
export const expenseHeaders = ['Reference','Submission time','Reporter','Description','Category','Amount EUR','Proposed allocation','Final allocation','Status'];
export function sheetValues(r) {
  const name = EMPLOYEES.find(e => e.id === r.employee_id).name;
  if (r.kind === 'sale') return [r.reference,r.submitted_at,name,r.customer,`${r.project} — ${allocationName(r.project)}`,r.description,r.amount_cents/100,...r.proposed_split.map(v=>`${v/100}%`),...(r.final_split ? r.final_split.map(v=>`${v/100}%`) : ['','','']),...(r.commission_cents || [0,0,0]).map(v=>v/100),r.status === 'approved' ? 'Approved' : 'Pending approval'];
  return [r.reference,r.submitted_at,name,r.description,r.category,r.amount_cents/100,allocationName(r.proposed_allocation),r.final_allocation ? allocationName(r.final_allocation) : '',r.status === 'allocated' ? 'Allocated' : 'Awaiting allocation'];
}
export async function synchronize(r) {
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) throw new Error('Google Sheets is not configured.');
  if (id === '1AZ__P96ArJzLLTs6kGVPPIDS8229bhYcKgGu6I8O7wk') throw new Error('The course submission spreadsheet is read-only. Configure a separate transaction ledger.');
  const tab = r.kind === 'sale' ? 'Sales' : 'Expenses';
  const headers = r.kind === 'sale' ? salesHeaders : expenseHeaders;
  const end = r.kind === 'sale' ? 'Q' : 'I';
  const token = await googleToken();
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values:batchUpdate`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ valueInputOption: 'RAW', data: [{ range: `${tab}!A1:${end}1`, values: [headers] }, { range: `${tab}!A${r.sheet_row}:${end}${r.sheet_row}`, values: [sheetValues(r)] }] }), signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('Sheets update failed. Check the spreadsheet ID, Sales/Expenses tabs, and service-account Editor access.');
}
const safeError = error => error.message && !/https?:|PRIVATE KEY|eyJ/.test(error.message) ? error.message.slice(0,250) : 'Delivery failed. Check configuration and retry.';
export async function deliver(reference, {sync = true, notify = true, receipt = false, fault = null} = {}) {
  // A lease serializes concurrent deliveries for the same record. Sheet rows never append.
  const token = randomUUID();
  const claimed = await rpc('claim_delivery', {p_reference:reference,p_token:token});
  if (!claimed.length) return getRecord(reference);
  let r = claimed[0];
  try {
    if (receipt && r.receipt_status !== 'sent') {
      try {
        await telegram(r.origin_chat_id, `Recorded ${r.reference}: ${euro(r.amount_cents)}.\n${allocationName(r.kind==='sale' ? r.project : r.proposed_allocation)}.\nStatus: ${r.status.replaceAll('_',' ')}. Saved in the finance system.`);
        await patchRecord(reference,{receipt_status:'sent',receipt_error:null});
      } catch(error) { await patchRecord(reference,{receipt_status:'failed',receipt_error:safeError(error)}); }
    }
    if (notify && r.notification_status !== 'not_required' && r.notification_status !== 'sent') {
      const chat = await recipient(r);
      if (!chat) await patchRecord(reference,{notification_status:'no_recipient',notification_error:'No Telegram recipient linked'},r.version);
      else {
        // Freeze a website recipient once a decision delivery is attempted.
        if (!r.origin_chat_id) { await patchRecord(reference,{origin_chat_id:chat}); r.origin_chat_id=chat; }
        try {
          if (fault==='telegram') throw new Error('Controlled notification failure for integration testing. Retry to deliver.');
          await telegram(chat,decisionMessage(r));
          await patchRecord(reference,{notification_status:'sent',notification_error:null},r.version);
        } catch(error) { await patchRecord(reference,{notification_status:'failed',notification_error:safeError(error)},r.version); }
      }
    }
    if (sync) {
      for (let attempt=0;attempt<2;attempt++) {
        r = await getRecord(reference);
        if(r.sync_status==='synced') break;
        try {
          if(fault==='sheets') throw new Error('Controlled Sheets interruption. The transaction is saved. Retry to synchronize.');
          await synchronize(r);
          const updated=await patchRecord(reference,{sync_status:'synced',sync_error:null},r.version);
          if(updated.length) break;
        } catch(error) { await patchRecord(reference,{sync_status:'failed',sync_error:safeError(error)},r.version); break; }
      }
    }
  } finally { await rpc('release_delivery',{p_reference:reference,p_token:token}); }
  return getRecord(reference);
}
