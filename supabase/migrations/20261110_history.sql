-- v2.1：在自己的 Supabase 项目 SQL Editor 中整段执行。
begin;
create table if not exists public.learning_history (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('text','voice')),
  title text not null check (char_length(title) between 1 and 80),
  direction text not null check (direction in ('mandarin-cantonese','cantonese-mandarin')),
  source_text text not null check (char_length(source_text) between 1 and 20000),
  original_text text not null default '' check (char_length(original_text) <= 20000),
  result_text text not null default '' check (char_length(result_text) <= 12000),
  provider text not null check (provider in ('groq','siliconflow','demo','unknown')),
  script text not null check (script in ('auto','simplified','traditional')),
  segments jsonb not null default '[]'::jsonb check (jsonb_typeof(segments) = 'array' and jsonb_array_length(segments) <= 1000 and octet_length(segments::text) <= 200000),
  audio_path text,
  audio_name text check (char_length(audio_name) <= 200),
  created_at timestamptz not null default now(),
  check (kind <> 'voice' or direction = 'cantonese-mandarin'),
  check (audio_path is null or (kind = 'voice' and audio_path ~ ('^' || user_id::text || '/' || id::text || '\.(mp3|wav|m4a|webm|ogg)$')))
);
create index if not exists learning_history_user_created on public.learning_history(user_id, created_at desc);
alter table public.learning_history enable row level security;
revoke all on public.learning_history from anon;
grant select, insert, delete on public.learning_history to authenticated;
drop policy if exists canto_history_select on public.learning_history;
create policy canto_history_select on public.learning_history for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists canto_history_insert on public.learning_history;
create policy canto_history_insert on public.learning_history for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists canto_history_delete on public.learning_history;
create policy canto_history_delete on public.learning_history for delete to authenticated using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('canto-history-audio', 'canto-history-audio', false, 10485760, array['audio/mpeg','audio/wav','audio/mp4','audio/webm','audio/ogg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists canto_audio_read on storage.objects;
create policy canto_audio_read on storage.objects for select to authenticated using (bucket_id = 'canto-history-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists canto_audio_insert on storage.objects;
create policy canto_audio_insert on storage.objects for insert to authenticated with check (bucket_id = 'canto-history-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists canto_audio_delete on storage.objects;
create policy canto_audio_delete on storage.objects for delete to authenticated using (bucket_id = 'canto-history-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);
commit;
