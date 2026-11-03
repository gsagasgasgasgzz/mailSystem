-- Run in Supabase SQL editor. Public tables have NO direct anonymous access.
create extension if not exists pgcrypto;
create table if not exists public.letters (
 id uuid primary key default gen_random_uuid(),
 number_key bigint not null check (number_key between 0 and 99999999),
 number_display varchar(8) not null check (number_display ~ '^[0-9]{1,8}$'),
 owner varchar(100) not null check (length(btrim(owner)) > 0),
 year smallint check (year between 2001 and 9999),
 friend_of text[] not null default '{}'::text[] check (cardinality(friend_of) <= 30),
 note varchar(500) not null default '',
 version integer not null default 1,
 deleted_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.letters add column if not exists year smallint check (year between 2001 and 9999);
alter table public.letters add column if not exists friend_of text[] not null default '{}'::text[] check (cardinality(friend_of) <= 30);
-- Retain reservation of deleted numbers until restored/retired manually.
create unique index if not exists letters_number_unique on public.letters(number_key);
create table if not exists public.letter_history (
 id bigint generated always as identity primary key,
 letter_id uuid not null,
 action varchar(20) not null,
 version integer not null,
 snapshot jsonb not null,
 created_at timestamptz not null default now()
);
create index if not exists letter_history_recent on public.letter_history(created_at desc);
alter table public.letters enable row level security;
alter table public.letter_history enable row level security;
revoke all on public.letters from anon, authenticated;
revoke all on public.letter_history from anon, authenticated;
-- Atomic writes: concurrent edits use version checks; history written in same transaction.
drop function if exists public.registry_mutate(text,uuid,integer,text,text,text);
drop function if exists public.registry_mutate(text,uuid,integer,text,text,smallint,text);
create or replace function public.registry_mutate(p_action text,p_id uuid,p_expected_version integer,p_number text,p_owner text,p_year smallint,p_friend_of text[],p_note text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v public.letters%rowtype; v_key bigint; v_display text; v_owner text; v_year smallint; v_friend_of text[]; v_note text;
begin
 if p_action not in ('create','update','delete','restore') then raise exception 'Invalid action'; end if;
 if p_action in ('create','update') then
  if p_number is null or p_number !~ '^[0-9]{1,8}$' then raise exception 'เลขจดหมายต้องเป็นตัวเลข 1–8 หลัก'; end if;
  if p_year is not null and p_year not between 2001 and extract(year from current_date)::integer then raise exception 'ปีต้องอยู่ระหว่าง 2001 ถึงปีปัจจุบัน'; end if;
  if coalesce(cardinality(p_friend_of),0)>30 or exists (select 1 from unnest(coalesce(p_friend_of,'{}'::text[])) as names(name) where length(btrim(name)) not between 1 and 100) then raise exception 'รายชื่อเพื่อนไม่ถูกต้อง'; end if;
  v_key := p_number::bigint; v_display := p_number; v_owner := btrim(coalesce(p_owner,'')); v_note := btrim(coalesce(p_note,''));
  v_year := p_year;
  select coalesce(array_agg(name order by name), '{}'::text[]) into v_friend_of
   from (select distinct btrim(value) as name from unnest(coalesce(p_friend_of,'{}'::text[])) as names(value)) as cleaned;
  if length(v_owner) not between 1 and 100 or length(v_note)>500 then raise exception 'ชื่อหรือหมายเหตุยาวเกินกำหนด'; end if;
 end if;
 if p_action='create' then
  insert into public.letters(number_key,number_display,owner,year,friend_of,note) values(v_key,v_display,v_owner,v_year,v_friend_of,v_note) returning * into v;
 else
  select * into v from public.letters where id=p_id for update;
  if not found then raise exception 'ไม่พบรายการ'; end if;
  if p_expected_version is distinct from v.version then raise exception 'ข้อมูลถูกแก้ไขโดยผู้อื่น กรุณารีเฟรช'; end if;
  if p_action='update' then
   if v.deleted_at is not null then raise exception 'รายการนี้อยู่ในถังขยะ'; end if;
   update public.letters set number_key=v_key,number_display=v_display,owner=v_owner,year=v_year,friend_of=v_friend_of,note=v_note,version=version+1,updated_at=now() where id=p_id returning * into v;
  elsif p_action='delete' then
   if v.deleted_at is not null then raise exception 'รายการถูกลบแล้ว'; end if;
   update public.letters set deleted_at=now(),version=version+1,updated_at=now() where id=p_id returning * into v;
  else
   if v.deleted_at is null then raise exception 'รายการนี้ยังใช้งานอยู่'; end if;
   update public.letters set deleted_at=null,version=version+1,updated_at=now() where id=p_id returning * into v;
  end if;
 end if;
 insert into public.letter_history(letter_id,action,version,snapshot) values(v.id,p_action,v.version,to_jsonb(v));
 return jsonb_build_object('ok',true,'id',v.id,'version',v.version);
exception when unique_violation then raise exception 'เลขจดหมายนี้มีอยู่แล้ว (รวมถึงในถังขยะ)';
end $$;
revoke all on function public.registry_mutate(text,uuid,integer,text,text,smallint,text[],text) from public,anon,authenticated;
