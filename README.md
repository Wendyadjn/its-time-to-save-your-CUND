# 敢学粤语 · Olivia Cantorigo

用于粤语学习的 Web 应用，支持粤普双向翻译、粤拼标注、互动朗读和录音转写，并可将学习内容保存到私有云端历史。

当前版本：[v2.4](https://github.com/Wendyadjn/its-time-to-save-your-CUND/tree/v2.4)（启动器预览） · [更新记录](CHANGELOG.md)

## 功能

| 功能 | 使用方式 |
| --- | --- |
| 粤普翻译 | 双向翻译，支持简体、繁体与自动判断；内置例句可离线演示 |
| 粤语朗读 | 直接输入粤语段落显示粤拼 |
| 粤拼与朗读 | 汉字对齐粤拼；播放全文、单句或单字，支持 1–2 倍速；使用 Ondoku HiuGaai 声线 |
| 语音转译 | 录音或上传音频，转写粤语并翻译为普通话；疑似不可靠片段需人工校对 |
| 私有历史 | 邮箱登录后手动保存文字，可选保存原音；支持搜索、复听、继续编辑与删除 |
| 服务与用量 | 切换 Groq / 硅基流动，查看调用状态、本站每日上限和可获取的官方额度信息 |

## 本地运行

新增双击入口：macOS 使用 `Start.command`，Windows x64 使用 `Start.cmd`。首次自动准备环境；详细步骤与尚未验证的平台见 [本地启动指南](docs/local-start.md)。下面保留手动启动方式。

需要 **Node.js 22 或以上**、npm。首次下载并启动：

```sh
git clone https://github.com/Wendyadjn/its-time-to-save-your-CUND.git
cd its-time-to-save-your-CUND
npm ci
cp .env.example .env.local
npm run dev
```

打开 [localhost:3000](http://localhost:3000/)。无需密钥即可尝试内置例句；自由文本翻译、转写和朗读需配置对应服务。已有 `.env.local` 时不要再次复制模板，以免覆盖配置。

无密钥时不调用翻译、转写或朗读 API；页面分别提示各功能的配置状态。录音与上传后的本地试听不需要 API。预置示例音频将在后续版本加入，当前无密钥不提供语音合成。

### 按需配置服务

在项目根目录的 `.env.local` 填写需要的项目；不必配置全部服务。修改后重启开发服务。

| 用途 | 环境变量 | 获取与配置 |
| --- | --- | --- |
| 翻译与转写：Groq | `AI_PROVIDER=groq`、`GROQ_API_KEY` | [创建 API Key](https://console.groq.com/keys) |
| 翻译与转写：硅基流动 | `AI_PROVIDER=siliconflow`、`SILICONFLOW_API_KEY` | [控制台](https://cloud.siliconflow.cn/) |
| 粤语朗读 | `ONDOKU_TOKEN` | [Ondoku Access Token](https://ondoku3.com/en/users/extension/) |
| 私有云端历史（可选） | `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY` | 按 [Supabase 配置指南](docs/supabase-setup.md) 建表并设置权限 |

两家翻译服务都配置后可在页面手动切换；失败时不会自动转发给另一家。硅基流动转写不提供片段时间与置信度，结果需全文校对后确认翻译，不能定位单句原音。

服务商密钥只在服务器使用，不加 `NEXT_PUBLIC_` 前缀，也不要提交 GitHub。Supabase 的公开连接信息会提供给浏览器，只能使用 Publishable / legacy anon key，不能使用 Secret / service_role key。完整变量见 [.env.example](.env.example)。

## 使用边界与数据保存

- 文本翻译输入最多 **3,000 字**；音频最长 **5 分钟、最大 10 MB**，支持 MP3、WAV、M4A、WebM、OGG。录音需要麦克风权限及 HTTPS 或 localhost。
- 录音停止后可先本地试听，点击转写才发送给所选服务商。机器转写、翻译和多音字注音可能出错；质量提示不能保证发现所有漏字或幻觉。
- 只有主动保存才将文字留存到 Supabase，原音默认不保存。切离语音标签会清除未保存的临时内容；退出或切换账号也会清空工作区。删除云端历史及关联原音后，网页不提供恢复功能。
- 翻译、转写和朗读内容会发送至对应服务商，适用其数据政策；Ondoku 会保留生成历史。取消本地等待不保证取消服务商任务或费用。
- **本站每日上限不等于官方余额。** Groq 显示最近响应中的速率额度；Ondoku 只能记录手动核对快照；硅基流动国内站余额需到官网核对。免费额度、价格及模型权限以服务商账户为准。

## 开发与部署

技术栈：Next.js App Router、React、TypeScript、Tailwind CSS、Supabase；粤拼使用 `to-jyutping`，简繁转换使用 OpenCC，音频时长由 FFprobe 校验。

```sh
npm test            # 模拟服务商与播放引擎，不消耗真实 API 额度
npm run typecheck
npm run build
npm start
```

部署需要支持 **Next.js 服务端路由**的运行环境，不能只用 GitHub Pages 等静态托管。将所需环境变量配置到部署平台；启用历史时，还需设置 Supabase 正式站点与回调地址。

历史登录目前只保护私有历史，**不限制翻译、转写或朗读接口的访问**。公开分享前需设置访问保护，避免他人消耗站点密钥额度。当前用量账本依赖单 Node.js 进程和持久磁盘；多实例或无持久磁盘环境需改为共享存储。详见 [服务与部署说明](docs/services-and-deployment.md)。

## 项目文档

- [Supabase 配置与验证](docs/supabase-setup.md)：账号、数据库权限、私有原音存储。
- [服务与部署说明](docs/services-and-deployment.md)：模型、额度来源、限额配置、接口及运行限制。
- [更新记录](CHANGELOG.md)：已发布版本。收藏与间隔复习计划已取消，v2.2 改为独立粤语朗读板块。
