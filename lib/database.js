import { RuleError } from './rules.js';
export async function db(path, options = {}) {
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
  if (!url || !key) throw new RuleError('Supabase is not configured yet.', 503);
  const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...options.headers },
    signal: AbortSignal.timeout(12000)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (data?.code === '23505') throw new RuleError('This reference already exists.', 409);
    throw new RuleError('The database request failed. Check setup and try again.', 503);
  }
  return data;
}
export const rpc = (name, body) => db(`rpc/${name}`, { method: 'POST', body: JSON.stringify(body) });
export async function getRecord(reference) {
  const rows = await db(`transactions?reference=eq.${encodeURIComponent(reference)}&limit=1`);
  if (!rows[0]) throw new RuleError('Transaction not found.', 404);
  return rows[0];
}
export const patchRecord = (reference, patch, version) => db(`transactions?reference=eq.${encodeURIComponent(reference)}${version ? `&version=eq.${version}` : ''}`, { method: 'PATCH', body: JSON.stringify(patch) });
export async function recipient(r) {
  if (r.origin_chat_id) return r.origin_chat_id;
  const rows = await db(`telegram_accounts?employee_id=eq.${r.employee_id}&order=linked_at.desc&limit=1`);
  return rows[0]?.chat_id || null;
}
