-- 在权限迁移执行成功后运行；所有测试账号和记录最后会 rollback，不发送邮件。
begin;
insert into auth.users (id, aud, role, email, created_at, updated_at)
values ('10000000-0000-4000-8000-000000000001','authenticated','authenticated','canto-rls-a@example.invalid',now(),now()),
       ('10000000-0000-4000-8000-000000000002','authenticated','authenticated','canto-rls-b@example.invalid',now(),now());
insert into public.learning_history (id,user_id,kind,title,direction,source_text,result_text,provider,script)
values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','text','测试 A','mandarin-cantonese','你好','你好','demo','simplified'),
       ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','text','测试 B','mandarin-cantonese','你好','你好','demo','simplified');
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$
declare visible integer; removed integer;
begin
  select count(*) into visible from public.learning_history where id in ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002');
  if visible <> 1 then raise exception 'FAIL: another user record is visible'; end if;
  delete from public.learning_history where id = '20000000-0000-4000-8000-000000000002';
  get diagnostics removed = row_count;
  if removed <> 0 then raise exception 'FAIL: another user record can be deleted'; end if;
  begin
    insert into public.learning_history (id,user_id,kind,title,direction,source_text,provider,script)
    values ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','text','越权测试','mandarin-cantonese','你好','demo','simplified');
    raise exception 'FAIL: forged user_id accepted';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS: history read, insert and delete isolation';
end $$;
rollback;
