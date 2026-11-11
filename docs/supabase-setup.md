# v2.1 云端历史记录：Supabase 准备步骤

v1.3 已实现服务与用量；v2.1 将加入账号和云端历史，v2.2 再加入收藏复习。本指南先完成云端项目准备，不会自动上传现有录音或文字。

## 第一步：创建项目

1. 打开 https://supabase.com/dashboard ，注册或登录。
2. 使用 Free 组织/方案，点击 New project。
3. 项目名称可填 `olivia-cantorigo`。数据库密码由你生成并妥善保存，不需要发到聊天中。
4. 选择合适的地区（例如距离使用者较近的可选地区），创建项目，等待初始化完成。不要为此升级付费方案；免费额度和停用规则以官方页面为准。
5. 创建完成后告诉我“Supabase 项目已创建”，再继续 v2.1 的表结构和权限配置。

## 第二步：接入时需要的项目资料

之后从项目的 Connect 面板或设置中取得 Project URL 和 Publishable Key；旧项目可能显示 legacy anon key。只需在本机 `.env.local` 配置，不要把真实密钥贴在聊天里或提交 GitHub。

不需要把数据库密码、`service_role` 或 Secret Key 放到浏览器。历史数据上线前必须配置账号登录、行级权限以及私有音频存储，并验证用户之间不能读取彼此记录；表结构和权限脚本由 v2.1 提供，当前不用自行创建公开数据表或公开存储桶。

参考：
- https://supabase.com/docs/guides/getting-started/quickstarts/nextjs
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/pricing

## 第三步：执行历史记录权限脚本（v2.1）

取得 Project URL 和 Publishable Key 后，在 `.env.local` 填入：

```dotenv
SUPABASE_URL=你的ProjectURL
SUPABASE_PUBLISHABLE_KEY=你的PublishableKey
```

这里故意使用服务端配置名称；代码只会把通过检查的公开连接资料传给浏览器，拒绝 Secret Key 和 `service_role`。旧项目的 legacy anon key 也支持。保存后重启开发服务。

1. 在 Supabase 左侧打开 SQL Editor → New query。
2. 复制项目内 `supabase/migrations/20261110_history.sql` 的全部内容，粘贴并点击 Run。
3. 脚本创建 `learning_history` 表、按账号隔离的读写权限，以及私有 `canto-history-audio` 音频桶。不要把这个桶改成 Public。
4. 再运行 `supabase/tests/history_rls.sql`，验证另一个账号的记录不能读取、伪造写入或删除。脚本最后回滚测试数据，不发送邮件；这是数据库记录权限测试，不替代真实音频存储联调。
5. 在 Authentication → URL Configuration，把本地 Site URL 设置为 `http://localhost:3000`；正式部署时改为正式 HTTPS 网站，并配置需要的 Redirect URLs。
6. 保留邮箱确认功能，在网页“历史记录”注册账号并通过邮件确认，然后登录。Supabase 默认邮件发送有速率与收件人限制，遇到邮件问题时需按官方指引配置自己的 SMTP，不应为绕过测试关闭用户数据隔离。

## 使用与验证

- 在翻译区或语音区点击“保存到历史”，只有这次点击会将当前内容保存到 Supabase。
- 原音默认不保存；勾选“同时保存这份原音”后，原音与记录关联保存在私有桶中，仍有五分钟和 10 MB 的应用上传限制。
- 历史支持标题搜索、分页、查看原始机器转写、查看校对后的文本、复听保存的原音、继续编辑和删除。再次保存编辑结果会产生新记录。
- 删除需要在界面确认，音频删除失败时保留文字以便重试。音频和数据库是两种服务，不支持一个跨服务原子事务；网络中断后应先刷新列表确认结果再重试，避免重复保存。异常清理失败时会给出提示。
- 退出或切换账号会清除工作区内容，避免下一个使用者看到上个账号的云端记录。未保存内容会丢失，退出前先保存。
- 使用两个账号分别测试记录与音频互相不可读。未登录不能读取私有历史。音频播放链接有效一小时，失效时重新打开记录。
- v1.3 用量账本仍在本机，不会因此自动转为 Supabase 全局限额；多实例部署仍需单独迁移限额存储。
