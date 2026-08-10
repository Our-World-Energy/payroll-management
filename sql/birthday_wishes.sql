-- Birthday wishes: one row per (sender → recipient → birthday date).
-- Run once in the Supabase SQL editor (the app reads/writes it via supabase-js).
create table if not exists public.birthday_wishes (
  id          uuid primary key default gen_random_uuid(),
  "fromEmail" text        not null,
  "fromName"  text        not null default '',
  "toEmail"   text        not null,
  "wishDate"  text        not null,               -- YYYY-MM-DD (the birthday being celebrated)
  message     text        not null default '',   -- optional note (may contain emojis)
  "createdAt" timestamptz not null default now(),
  constraint birthday_wishes_unique unique ("fromEmail", "toEmail", "wishDate")
);

create index if not exists birthday_wishes_to_idx   on public.birthday_wishes ("toEmail", "wishDate");
create index if not exists birthday_wishes_from_idx on public.birthday_wishes ("fromEmail", "wishDate");
