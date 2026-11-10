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
