-- Chalkline sync schema
-- Run once in Supabase: SQL Editor -> New query -> paste all of this -> Run.
-- Safe to re-run.
--
-- Design: no accounts. Each player gets a random 16-character sync code on their device.
-- The table stores SHA-256(code), never the code. The table has RLS on and NO policies,
-- so the public (anon / publishable) key cannot read or write it directly.
-- The only door in is chalkline_push(), which validates input, merges, and returns the
-- merged record for that one code.
-- Stats merge as per-device slices (each device only ever overwrites its own slice),
-- so two phones playing offline never clobber each other. Custom decks merge by
-- newest timestamp, with deletions kept as tombstones.

create table if not exists public.chalkline_sync (
  key_hash   text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.chalkline_sync enable row level security;
revoke all on table public.chalkline_sync from anon, authenticated;

create or replace function public.chalkline_push(p_key text, p_device text, p_slice jsonb, p_decks jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  h     text;
  cur   jsonb;
  decks jsonb;
  k     text;
  v     jsonb;
  newu  numeric;
  oldu  numeric;
begin
  if p_key is null or p_key !~ '^[0-9A-HJKMNP-TV-Z]{16}$' then raise exception 'invalid sync code'; end if;
  if p_device is null or p_device !~ '^d[a-z0-9]{6,24}$' then raise exception 'invalid device'; end if;
  if p_slice is null or jsonb_typeof(p_slice) <> 'object' then raise exception 'invalid slice'; end if;
  if p_decks is not null and jsonb_typeof(p_decks) <> 'object' then raise exception 'invalid decks'; end if;
  if octet_length(p_slice::text) > 100000 then raise exception 'stats payload too large'; end if;
  if octet_length(coalesce(p_decks, '{}'::jsonb)::text) > 400000 then raise exception 'decks payload too large'; end if;

  h := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  insert into public.chalkline_sync (key_hash) values (h) on conflict (key_hash) do nothing;
  select data into cur from public.chalkline_sync where key_hash = h for update;

  if jsonb_typeof(cur->'devices') = 'object'
     and not (cur->'devices' ? p_device)
     and (select count(*) from jsonb_object_keys(cur->'devices')) >= 12 then
    raise exception 'too many devices on this sync code';
  end if;

  decks := coalesce(cur->'decks', '{}'::jsonb);
  for k, v in select key, value from jsonb_each(coalesce(p_decks, '{}'::jsonb)) loop
    continue when k !~ '^u_[a-z0-9]{1,16}$' or jsonb_typeof(v) <> 'object';
    newu := case when (v->>'u') ~ '^[0-9]{1,15}$' then (v->>'u')::numeric else 0 end;
    oldu := case when (decks->k->>'u') ~ '^[0-9]{1,15}$' then (decks->k->>'u')::numeric else -1 end;
    if newu > oldu then
      decks := decks || jsonb_build_object(k, v);
    end if;
  end loop;

  cur := jsonb_build_object(
    'devices', coalesce(cur->'devices', '{}'::jsonb) || jsonb_build_object(p_device, p_slice),
    'decks',   decks
  );
  update public.chalkline_sync set data = cur, updated_at = now() where key_hash = h;
  return cur;
end
$$;

revoke all on function public.chalkline_push(text, text, jsonb, jsonb) from public;
grant execute on function public.chalkline_push(text, text, jsonb, jsonb) to anon, authenticated;
