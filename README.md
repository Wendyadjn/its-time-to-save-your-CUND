# 粤语通 CantoneseMaster · v1.0

粤语学习网页：粤普双向翻译、简繁转换、逐字粤拼、Ondoku HiuGaai 朗读，以及录音 / 上传转写和普通话翻译。

基于 Next.js App Router、React、TypeScript、Tailwind CSS 4 和 Lucide，支持桌面双栏与移动端上下布局。

## 快速开始

需要 Node.js 20.9 或以上。克隆仓库后，在项目根目录运行：

```sh
npm ci
cp .env.example .env.local
```

编辑 `.env.local`，填写两个服务端密钥：

```dotenv
GROQ_API_KEY=你的Groq密钥
ONDOKU_TOKEN=你的Ondoku访问令牌
```

- Groq：在 [API Keys](https://console.groq.com/keys) 创建密钥，用于文本翻译和语音转写。
- Ondoku：登录后在 [Access Token 页面](https://ondoku3.com/en/users/extension/) 获取令牌，用于 HiuGaai 粤语朗读。
- 已有 `.env.local` 时直接编辑，不要用模板覆盖已有配置。无需在密钥名称前添加 `NEXT_PUBLIC_`。
- `.env.local` 已被 Git 忽略；仓库仅包含空白模板。不要提交或公开真实密钥。

启动网页：

```sh
npm run dev
```

打开 [localhost:3000](http://localhost:3000/)。修改密钥后停止旧服务（Control+C），重新启动。

未配置密钥时可使用本地例句翻译；AI 翻译、语音转写和 Ondoku 朗读需要各自的密钥。免费额度和费用以服务商账户为准，项目不会判断账户是否已启用付费。

## 功能与使用

### 文本翻译与粤拼学习

1. 默认进入“本地例句演示”，点击下方例句后翻译；演示仅支持内置例句及其组合。
2. 在“翻译方式”选择“Groq AI 翻译”，可输入 1–3000 字自由文本。
3. 使用方向交换按钮切换普通话 → 粤语白话、粤语白话 → 普通话。
4. 全局提供简体、香港繁体、自动偏好；自动根据输入字形判断，共用字默认简体。译文也可单独切换简繁。
5. 粤语译文、粤语输入学习区和语音转写结果使用 Ruby 显示粤拼。点击汉字查看字卡并朗读，未知读音显示 `—`。

支持粘贴、清空、字数统计和复制纯译文。输入变化会清除旧译文并取消旧请求；API 失败不会用演示结果替代。剪贴板功能需要浏览器许可及 HTTPS / localhost。

### Ondoku HiuGaai 朗读

- 当前声线固定为 `zh-HK-HiuGaaiNeural`，语速 0.9。
- 支持播放全文、句首喇叭 / 句子空白处播放单句、点击汉字播放单字，以及停止播放。
- 全文按句依次生成、播放；高亮根据实际播放事件更新，首次生成和句间可能需要等待。
- 当前页面复用最近 100 条文字对应的音频地址，刷新后清除，不持久化音频文件；地址失效时需重新生成。
- 点击播放会把文字发送给 Ondoku，并使用账户字数额度。界面提供 Ondoku 来源署名。服务商保留生成历史，可在其网站管理。
- 浏览器若阻止播放，请再次点击；当前不自动切换回设备声线。

原设备语音播放器代码仍保留在 `src/lib/speech.ts`，当前界面仅复用其中的分句功能。

### 语音转译

1. 在“语音转译”点击开始录音并授权麦克风，再点击停止；单次最长约 120 秒，后台计时可能受浏览器限制。
2. 或上传 MP3、WAV、M4A、WebM、OGG，单文件最大 10 MB。
3. 先本地试听，点击“开始转写并翻译”才上传；停止录音不会自动发送。
4. Groq Whisper 转写后自动翻译普通话。粤语转写可校对、显示粤拼并朗读。
5. 修改转写后可单独重新翻译，无需再次上传。超过 3000 字的转写会保留，需缩短后翻译；翻译失败也会保留原文。

录音需要 HTTPS / localhost 及支持 MediaRecorder 的浏览器。取消或切离语音标签会释放麦克风并终止本页操作；切离标签会清除语音模块临时数据。

## API 与数据流

所有服务商密钥仅在服务端使用，不返回浏览器。

| 路径 | 用途 | 当前服务 / 模型 | 本站单进程上限 |
| --- | --- | --- | --- |
| `POST /api/translate` | 粤普双向翻译 | Groq `qwen/qwen3.8-27b` | 10 次 / 分钟 |
| `POST /api/transcribe` | 音频转写 | Groq `whisper-large-v3` | 6 次 / 分钟 |
| `POST /api/tts` | 粤语音频生成 | Ondoku HiuGaai | 20 次 / 分钟 |

文本翻译接收 JSON：`text`、`direction`（`mandarin-cantonese` / `cantonese-mandarin`）；转写接收 multipart 文件字段 `file`；朗读接收 JSON 字段 `text`，单次最多 12000 字。

接口校验来源、请求格式和大小，并设置超时、限流及错误提示；音频上传还检查扩展名、MIME 和常见容器签名，完整解码由上游处理。翻译请求体最多 32 KB，朗读最多 64 KB。

- 翻译服务端超时 30 秒，客户端 35 秒；转写服务端 60 秒，客户端转写加翻译整条链路 100 秒；朗读生成服务端 60 秒，客户端单次请求 65 秒。
- 文字和音频会发送至对应服务商，数据处理适用其政策。应用不将用户音频或转写保存到数据库或项目文件。
- 停止播放或取消请求可以终止本地等待，但已提交给服务商的生成任务仍可能计入额度。
- Origin 校验不是身份认证。当前限流由单进程全部用户共享，公开部署前需要登录 / 网关访问保护和持久化限流，以保护账户额度。

## 目录结构

```text
src/app/
  layout.tsx                  # 元信息、全局样式入口
  page.tsx                    # 单页 Dashboard
  globals.css                 # 响应式布局、粤拼、播放高亮与弹窗
  api/translate/route.ts      # Groq 翻译代理
  api/transcribe/route.ts     # 音频校验与 Whisper 代理
  api/tts/route.ts            # Ondoku 代理与音频响应校验
src/components/
  cantonese-app.tsx           # Tabs、输入输出、翻译方向与简繁偏好
  jyutping-text.tsx           # Ruby 注音、字卡、朗读与高亮
  voice-recorder.tsx          # 录音、试听、上传、编辑与重新翻译
src/lib/
  translation.ts             # OpenCC、演示词库、类型与字数上限
  jyutping.ts                # to-jyutping 注音
  audio.ts                   # 音频格式、大小与容器签名
  ondoku-speech.ts            # 网络音频队列、缓存、取消与播放事件
  speech.ts                  # 分句及原设备语音实现
tests/                       # 翻译、注音、音频、API 与播放回归测试
.env.example                 # 不含真实密钥的配置模板
```

运行依赖：`next`、`react`、`react-dom`、`lucide-react`、`opencc-js`、`to-jyutping`。API 使用原生 `fetch`，无需额外 SDK。

## 检查与生产运行

```sh
npm test
npm run typecheck
npm run build
npm start
```

生产构建使用 Webpack。测试使用模拟上游和播放引擎，不需要真实密钥，也不消耗 API 额度；覆盖简繁转换、演示翻译、注音对齐、音频校验、接口错误处理、播放取消及 Ondoku 返回格式兼容。

部署需要支持 Next.js 服务端路由的环境，不能只使用静态文件托管。在托管平台配置 `GROQ_API_KEY` 和 `ONDOKU_TOKEN` 并重新部署；GitHub 源码与版本标签不包含本地密钥，也不代表网站已上线。

## 已知限制

- 自动翻译、注音和单字合成可能误判多音字，单字读音可能与句中不同；学习时需结合语境核对。
- 自动转写可能漏字、幻觉或把粤语写成普通话；当前不是边录边转写，也没有说话人区分。
- 暂无普通话拼音、单字释义、账号和学习历史保存。
- 服务商模型和额度可能变化；翻译模型配置位于对应服务端路由中。

## 版本与参考

[v1.0 源码快照](https://github.com/Wendyadjn/its-time-to-save-your-CUND/tree/v1.0)：原版 UI，粤普翻译、粤拼学习、录音转译及 HiuGaai 朗读。

- [Groq 语音转写文档](https://console.groq.com/docs/speech-to-text)
- [Groq 额度与限速](https://console.groq.com/docs/rate-limits)
- [Ondoku API 文档](https://ondoku3.com/en/developer/api/standard-tts.html)
- [Ondoku 声线列表](https://ondoku3.com/en/developer/api/voices.html)
