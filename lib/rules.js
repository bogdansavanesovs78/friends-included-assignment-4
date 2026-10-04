export const EMPLOYEES = [
  { id: 'richard', name: 'Richard Darling', role: 'sales' },
  { id: 'anastasia', name: 'Anastasia Ferrari', role: 'sales' },
  { id: 'jean', name: 'Jean-Claude Bērziņš', role: 'sales' },
  { id: 'kevin', name: 'Kevin von Whatever', role: 'expenses' },
  { id: 'svetlana', name: 'Svetlana de Monte Carlo', role: 'manager' }
];
export const SALESPEOPLE = EMPLOYEES.slice(0, 3);
export class RuleError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
export function actor(id) {
  const employee = EMPLOYEES.find(e => e.id === id);
  if (!employee) throw new RuleError('Select a valid demonstration role.', 403);
  return employee;
}
export function allow(id, role) {
  const employee = actor(id);
  if (employee.role !== role) throw new RuleError('This role is not permitted to perform this action.', 403);
  return employee;
}
function text(value, name, max = 500) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new RuleError(`${name} is required (maximum ${max} characters).`);
  return value.trim();
}
export function amount(value) {
  const s = String(value ?? '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new RuleError('Enter a positive euro amount with at most two decimal places.');
  const cents = Math.round(Number(s) * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 100000000000) throw new RuleError('Amount must be greater than zero and at most €1 billion.');
  return cents;
}
export function split(values) {
  if (!Array.isArray(values) || values.length !== 3) throw new RuleError('Provide all three commission shares.');
  const result = values.map(value => {
    if (!/^\d+(\.\d{1,2})?$/.test(String(value ?? '').trim())) throw new RuleError('Commission shares must be percentages from 0 to 100.');
    const v = Math.round(Number(value) * 100);
    if (v > 10000) throw new RuleError('Commission shares must be percentages from 0 to 100.');
    return v;
  });
  if (result.reduce((a, b) => a + b, 0) !== 10000) throw new RuleError('Commission shares must total exactly 100%.');
  return result;
}
export function commissions(cents, basisPoints) {
  const pool = Math.round(cents / 10);
  const earned = basisPoints.map(s => Math.round(pool * s / 10000));
  const winner = basisPoints.indexOf(Math.max(...basisPoints));
  earned[winner] += pool - earned.reduce((a, b) => a + b, 0);
  return { pool, earned };
}
export function allocation(value) {
  if (!['A', 'B', 'overhead'].includes(value)) throw new RuleError('Choose Project A, Project B, or Company overhead.');
  return value;
}
export function submission(id, input, source = 'website', chat = null) {
  if (!['sale', 'expense'].includes(input.kind)) throw new RuleError('Choose sale or expense.');
  allow(id, input.kind === 'sale' ? 'sales' : 'expenses');
  const reference = text(input.reference, 'Reference', 40).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(reference)) throw new RuleError('Reference may contain letters, numbers, hyphens and underscores.');
  const r = { reference, kind: input.kind, employee_id: id, description: text(input.description, 'Description'), amount_cents: amount(input.amount), source, origin_chat_id: chat, status: input.kind === 'sale' ? 'pending' : 'awaiting_allocation', sync_status: 'pending', notification_status: 'not_required' };
  if (input.kind === 'sale') {
    if (!['A', 'B'].includes(input.project)) throw new RuleError('Choose Project A or Project B.');
    Object.assign(r, { customer: text(input.customer, 'Customer', 150), project: input.project, proposed_split: split(input.split) });
  } else {
    if (!['Materials', 'Travel', 'Other'].includes(input.category)) throw new RuleError('Choose Materials, Travel, or Other.');
    Object.assign(r, { category: input.category, proposed_allocation: allocation(input.allocation) });
    if (r.proposed_allocation === 'overhead') Object.assign(r, { status: 'allocated', final_allocation: 'overhead' });
  }
  return r;
}
export function decision(id, record, input) {
  allow(id, 'manager');
  if (['approved', 'allocated'].includes(record.status)) return null;
  const r = { decided_by: id, decided_at: new Date().toISOString(), sync_status: 'pending', sync_error: null, notification_status: 'pending', notification_error: null };
  if (record.kind === 'sale') {
    const shares = split(input.split);
    const c = commissions(record.amount_cents, shares);
    Object.assign(r, { status: 'approved', final_split: shares, commission_cents: c.earned, pool_cents: c.pool });
  } else Object.assign(r, { status: 'allocated', final_allocation: allocation(input.allocation) });
  return r;
}
export function totals(records) {
  const result = { A: { income: 0, commissions: 0, expenses: 0, result: 0 }, B: { income: 0, commissions: 0, expenses: 0, result: 0 }, income: 0, commissions: 0, expenses: 0, overhead: 0, unallocated: 0, pendingSales: 0, earned: [0, 0, 0], result: 0 };
  for (const r of records) {
    if (r.kind === 'sale') {
      if (r.status !== 'approved') { result.pendingSales += r.amount_cents; continue; }
      result.income += r.amount_cents; result[r.project].income += r.amount_cents;
      result.commissions += r.pool_cents; result[r.project].commissions += r.pool_cents;
      r.commission_cents.forEach((c, i) => result.earned[i] += c);
    } else {
      result.expenses += r.amount_cents;
      if (r.status === 'awaiting_allocation') result.unallocated += r.amount_cents;
      else if (r.final_allocation === 'overhead') result.overhead += r.amount_cents;
      else result[r.final_allocation].expenses += r.amount_cents;
    }
  }
  for (const p of ['A', 'B']) result[p].result = result[p].income - result[p].commissions - result[p].expenses;
  result.result = result.income - result.commissions - result.expenses;
  return result;
}
export const euro = cents => `€${(cents / 100).toFixed(2)}`;
export const allocationName = a => ({ A: 'Respectable Relatives', B: 'Drunk University Friends', overhead: 'Company overhead' }[a] || 'Awaiting allocation');
export function decisionMessage(r) {
  if (r.kind === 'sale') {
    const changed = r.proposed_split.some((v, i) => v !== r.final_split[i]);
    return `Sale ${r.reference} approved — commission split ${changed ? 'changed' : 'unchanged'}.\nSale ${euro(r.amount_cents)}; total commission ${euro(r.pool_cents)}.\n${SALESPEOPLE.map((e, i) => `${e.name}: ${r.proposed_split[i] / 100}% → ${r.final_split[i] / 100}% (${euro(r.commission_cents[i])}).`).join('\n')}`;
  }
  const changed = r.proposed_allocation !== r.final_allocation;
  return `Expense ${r.reference} — allocation ${changed ? 'changed' : 'confirmed'}.\n${euro(r.amount_cents)}: ${r.description}\nProposed: ${allocationName(r.proposed_allocation)}.\nApproved: ${allocationName(r.final_allocation)}.`;
}
export function parseBot(text) {
  const match = text.match(/^\/(sale|expense)(?:@\w+)?\s+([\s\S]+)$/i);
  if (!match) throw new RuleError('Use /help for the sale and expense command formats.');
  const parts = match[2].split('|').map(s => s.trim());
  if (match[1].toLowerCase() === 'sale' && parts.length === 8) {
    const [reference, customer, project, description, amount, ...split] = parts;
    return { kind: 'sale', reference, customer, project: project.toUpperCase(), description, amount, split };
  }
  if (match[1].toLowerCase() === 'expense' && parts.length === 5) {
    const [reference, description, category, amount, allocation] = parts;
    const cat = ['Materials', 'Travel', 'Other'].find(c => c.toLowerCase() === category.toLowerCase());
    return { kind: 'expense', reference, description, category: cat, amount, allocation: allocation.toLowerCase() === 'overhead' ? 'overhead' : allocation.toUpperCase() };
  }
  throw new RuleError('Wrong number of fields. Use /help and separate each field with |.');
}
