-- Run once in the SQL Editor of the dedicated homework project.
create sequence if not exists public.sales_sheet_row start 2;
create sequence if not exists public.expenses_sheet_row start 2;
create table if not exists public.employees (
  id text primary key, name text not null, role text not null check(role in ('sales','expenses','manager'))
);
insert into public.employees values
 ('richard','Richard Darling','sales'),('anastasia','Anastasia Ferrari','sales'),
 ('jean','Jean-Claude Bērziņš','sales'),('kevin','Kevin von Whatever','expenses'),
 ('svetlana','Svetlana de Monte Carlo','manager') on conflict(id) do nothing;
create table if not exists public.telegram_accounts (
  user_id text primary key, chat_id text not null, employee_id text references public.employees(id),
  started_at timestamptz not null default now(), linked_at timestamptz
);
create table if not exists public.transactions (
  reference text primary key, kind text not null check(kind in ('sale','expense')),
  employee_id text not null references public.employees(id), submitted_at timestamptz not null default now(),
  customer text, project text check(project in ('A','B')), description text not null,
  amount_cents bigint not null check(amount_cents>0 and amount_cents<=100000000000),
  proposed_split integer[], final_split integer[], commission_cents bigint[], pool_cents bigint not null default 0,
  category text check(category in ('Materials','Travel','Other')),
  proposed_allocation text check(proposed_allocation in ('A','B','overhead')),
  final_allocation text check(final_allocation in ('A','B','overhead')),
  status text not null check(status in ('pending','approved','awaiting_allocation','allocated')),
  source text not null check(source in ('website','telegram')), origin_chat_id text,
  sheet_row bigint not null, version integer not null default 1,
  decided_by text references public.employees(id), decided_at timestamptz,
  sync_status text not null default 'pending', sync_error text,
  notification_status text not null default 'not_required', notification_error text,
  receipt_status text not null default 'not_required', receipt_error text,
  delivery_lease_until timestamptz, delivery_lease_token uuid,
  unique(kind,sheet_row),
  check ((kind='sale' and customer is not null and project is not null and array_length(proposed_split,1)=3
      and proposed_split[1] between 0 and 10000 and proposed_split[2] between 0 and 10000
      and proposed_split[3] between 0 and 10000 and proposed_split[1]+proposed_split[2]+proposed_split[3]=10000)
    or (kind='expense' and category is not null and proposed_allocation is not null)),
  check (status<>'approved' or (final_split is not null and commission_cents is not null and pool_cents>=0)),
  check (status<>'allocated' or final_allocation is not null)
);
create table if not exists public.telegram_updates (
  update_id bigint primary key, received_at timestamptz not null default now(), status text not null default 'processing'
);
create or replace function public.save_transaction(p_record jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare saved public.transactions; r public.transactions;
begin
 r := jsonb_populate_record(null::public.transactions,p_record);
 if not exists(select 1 from public.employees where id=r.employee_id and role=case when r.kind='sale' then 'sales' else 'expenses' end)
 then raise exception 'This role cannot submit this transaction'; end if;
 insert into public.transactions(reference,kind,employee_id,customer,project,description,amount_cents,
   proposed_split,category,proposed_allocation,final_allocation,status,source,origin_chat_id,sheet_row,receipt_status)
 values(r.reference,r.kind,r.employee_id,r.customer,r.project,r.description,r.amount_cents,r.proposed_split,
   r.category,r.proposed_allocation,r.final_allocation,r.status,r.source,r.origin_chat_id,
   case when r.kind='sale' then nextval('public.sales_sheet_row') else nextval('public.expenses_sheet_row') end,
   case when r.source='telegram' then 'pending' else 'not_required' end) returning * into saved;
 return to_jsonb(saved);
end $$;
create or replace function public.approve_transaction(p_reference text,p_actor text,p_patch jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare existing public.transactions; patch public.transactions;
begin
 if not exists(select 1 from public.employees where id=p_actor and role='manager') then raise exception 'Manager permission required'; end if;
 select * into existing from public.transactions where reference=p_reference for update;
 if not found then raise exception 'Transaction not found'; end if;
 if existing.status in ('approved','allocated') then return jsonb_build_object('changed',false,'record',to_jsonb(existing)); end if;
 patch := jsonb_populate_record(null::public.transactions,p_patch);
 if existing.kind='sale' and (patch.final_split is null or array_length(patch.final_split,1)<>3
   or patch.final_split[1] not between 0 and 10000 or patch.final_split[2] not between 0 and 10000
   or patch.final_split[3] not between 0 and 10000 or patch.final_split[1]+patch.final_split[2]+patch.final_split[3]<>10000)
 then raise exception 'Invalid commission split'; end if;
 if existing.kind='expense' and (patch.final_allocation is null or patch.final_allocation not in ('A','B','overhead')) then raise exception 'Invalid allocation'; end if;
 update public.transactions set status=patch.status,final_split=patch.final_split,commission_cents=patch.commission_cents,
  pool_cents=coalesce(patch.pool_cents,0),final_allocation=patch.final_allocation,decided_by=p_actor,decided_at=now(),
  version=version+1,sync_status='pending',sync_error=null,notification_status='pending',notification_error=null
 where reference=p_reference returning * into existing;
 return jsonb_build_object('changed',true,'record',to_jsonb(existing));
end $$;
create or replace function public.claim_delivery(p_reference text,p_token uuid) returns setof public.transactions
language sql security invoker set search_path='' as $$
 update public.transactions set delivery_lease_until=now()+interval '90 seconds',delivery_lease_token=p_token
 where reference=p_reference and (delivery_lease_until is null or delivery_lease_until<now()) returning *;
$$;
create or replace function public.release_delivery(p_reference text,p_token uuid) returns void
language sql security invoker set search_path='' as $$
 update public.transactions set delivery_lease_until=null,delivery_lease_token=null
 where reference=p_reference and delivery_lease_token=p_token;
$$;
alter table public.employees enable row level security;
alter table public.transactions enable row level security;
alter table public.telegram_accounts enable row level security;
alter table public.telegram_updates enable row level security;
revoke all on public.employees,public.transactions,public.telegram_accounts,public.telegram_updates from anon,authenticated;
revoke all on sequence public.sales_sheet_row,public.expenses_sheet_row from anon,authenticated;
revoke all on function public.save_transaction(jsonb),public.approve_transaction(text,text,jsonb),public.claim_delivery(text,uuid),public.release_delivery(text,uuid) from public,anon,authenticated;
grant execute on function public.save_transaction(jsonb),public.approve_transaction(text,text,jsonb),public.claim_delivery(text,uuid),public.release_delivery(text,uuid) to service_role;
grant all on public.employees,public.transactions,public.telegram_accounts,public.telegram_updates to service_role;
grant usage,select on sequence public.sales_sheet_row,public.expenses_sheet_row to service_role;
