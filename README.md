# 粤语通 CantoneseMaster

Next.js App Router + React + TypeScript + Tailwind CSS 4 + Lucide。
已完成 Step 1–5：翻译、粤拼、发音、录音 / 上传，以及 Groq 转写与自动翻译。

## 启动与检查

需要 Node.js 20.9 或以上。首次运行 `npm install`；已有 lockfile 时可用 `npm ci` 复现依赖。

```sh
npm run dev
npm test
npm run typecheck
npm run build
```

打开 http://localhost:3000。生产构建使用 Next.js 内置 Webpack。

## 免费 API 推荐及获取

当前选择 [Groq Free tier](https://console.groq.com/docs/billing-faqs)，用于个人开发试用。
免费方案有请求和 token 上限，不承诺无限、永久免费；实际额度和可用模型以你的 [账户 Limits](https://console.groq.com/settings/limits) 为准。
保持 Free tier，不升级付费 Developer 方案；服务端无法替你判断账户是否已开通付费。

1. 打开 https://console.groq.com 并自行注册 / 登录。
2. 在 https://console.groq.com/keys 点击 Create API Key，复制密钥。
3. 在项目根目录新建 `.env.local`（如已存在，只新增或修改这一项，不覆盖其他配置）：

```dotenv
GROQ_API_KEY=在这里填写你的真实密钥
```

4. 保存文件，停止旧开发服务（终端 Ctrl+C），重新运行 `npm run dev`。
5. 页面右上方“翻译方式”选择“Groq AI 翻译”，输入自己的句子后点击翻译。

不要将密钥发到聊天、提交 GitHub，或使用 `NEXT_PUBLIC_` 前缀。`.gitignore` 已忽略 `.env.local`，只跟踪空白模板 `.env.example`。
部署时在托管平台的服务器环境变量中配置同名密钥，并重新部署；GitHub 中的源码不会包含你的本地密钥。

当前默认模型为 `qwen/qwen3.8-27b`，是 Groq 官方列出的预览模型；若未来下线，在 `src/app/api/translate/route.ts` 更新模型及其参数。
选它是为了先验证免费开发链路，并不代表粤语翻译质量已通过评测。预览模型的可用性可能变化：
- [模型与预览说明](https://console.groq.com/docs/models)
- [Qwen 模型参数](https://console.groq.com/docs/model/qwen/qwen3.8-27b)
- [额度与限速说明](https://console.groq.com/docs/rate-limits)

后续语音转写可考虑同一平台的 [Whisper](https://console.groq.com/docs/speech-to-text)，但粤语口语保留程度需要实测。当前 TTS 继续使用设备粤语声线，无需另购语音 API。

## 目录与职责

```text
src/app/layout.tsx                  # 元信息、全局样式入口
src/app/page.tsx                    # Dashboard 入口
src/app/globals.css                 # 响应式布局、粤拼与播放高亮
src/app/api/translate/route.ts      # Groq 代理、密钥、校验、限流与错误处理
src/components/cantonese-app.tsx   # 输入、输出、模式与语言切换
src/components/jyutping-text.tsx   # Ruby 注音、字卡、全文/逐句/单字播放
src/components/voice-recorder.tsx # 录音、试听、上传、转写、编辑与翻译
src/app/api/transcribe/route.ts   # 音频校验及 Whisper 代理
src/lib/audio.ts                 # 共享音频格式、大小、签名限制
src/lib/translation.ts             # OpenCC、演示词库、类型与输入上限
src/lib/jyutping.ts                # to-jyutping 注音
src/lib/speech.ts                  # 声线选择、分段、取消与高亮回调
 tests/translation.test.ts         # 简繁与演示翻译测试
 tests/jyutping.test.ts            # 注音对齐及字形测试
 tests/speech.test.ts              # 语音队列与边界测试
 tests/translate-api.test.ts       # API 信任边界与模拟上游测试
.env.example                       # 不含密钥的环境变量模板
```

运行依赖：`next`、`react`、`react-dom`、`lucide-react`、`opencc-js`、`to-jyutping`。新增 API 使用原生 `fetch`，无需 SDK。

## 已有功能

- 文本翻译 / 语音转译 Tabs、桌面双栏和移动端上下布局。
- 本地例句演示与 Groq API 模式分开；API 失败不会静默回退演示结果。默认进入本地演示，避免误发文本。
- 演示仅支持内置例句及组合；API 模式可请求任意 1–3000 字的粤普双向翻译。
- 全局简体 / 香港繁体 / 自动偏好；自动按输入字形判断，共用字默认简体。输出可以单独切换。
- 输入变化会清除旧译文并取消待完成请求；切换模式、方向或离开文本标签也取消旧请求，防止过时结果覆盖。
- 清空、剪贴板粘贴、字符计数、复制纯译文。剪贴板需 HTTPS / localhost 和浏览器权限。
- 粤语译文和输入粤语学习区显示逐字 Ruby 粤拼。标点、换行、英文、emoji 均保留。未知字用 `—` 表示。
- 点字打开原生 dialog，展示粤拼、声调说明，并自动播放；支持再听一次、Esc / 关闭按钮，关闭后停止。
- 全文朗读、句首喇叭或句子空白处朗读整句，按原生播放事件高亮当前句。
- 使用 `zh-HK`、`yue` 或明确标记为粤语的设备声线，不回退普通话；监听声线加载更新。
- 长句按 160 个 Unicode 码点分段；新播放和组件卸载取消旧队列，并忽略旧回调。分段可能有短暂停顿。

## API 行为与边界

请求路径为 `POST /api/translate`，JSON 参数：`text` 和 `direction`（`mandarin-cantonese` / `cantonese-mandarin`）。
服务端密钥只通过 Authorization header 发至固定 Groq 地址，不返回浏览器，不记录到应用日志。
结果仍交给本地 OpenCC 转换字形，然后由现有粤拼 / 发音组件展示；AI 结果需要核对。

- 校验 JSON 类型、输入长度及翻译方向；读取请求体时限制 32 KB。
- 拒绝明确的跨站 Origin，响应不缓存。
- 单进程所有用户共享每分钟最多 10 次上游请求；Groq 自身也有限额。本站不会自动重试或切换付费服务。
- 服务端 30 秒超时、客户端 35 秒超时；区分未配置密钥、鉴权、限额、网络及译文截断。
- 未登录的本地开发版本：Origin 检查不是身份认证，进程内限流也不跨实例共享。公开部署前需增加登录/网关访问保护与持久化限流，避免他人耗尽免费额度。
- API 模式会把文本发给 Groq；不要提交敏感信息。设备语音是否联网取决于系统声线。

测试使用模拟上游与模拟语音引擎，不消耗额度；未配置真实密钥前无法验证账户可用性、真实译文质量或配额。
当前不提供普通话拼音或点字释义；未自动推送或部署。

## Step 5：语音转译

使用已有 `GROQ_API_KEY`，无需新增密钥或 SDK。选择“语音转译”标签页：

1. 点击开始录音，授权麦克风；再点停止。仅支持 HTTPS / localhost 与 MediaRecorder，最长约 120 秒（后台页面可能受浏览器计时限制）。
2. 或选择 MP3、WAV、M4A 文件；也接受浏览器录制的 WebM / OGG。单文件最大 10 MB。
3. 本地播放器可先试听。点击“开始转写并翻译”才上传，停止录音不会自动发送。
4. 服务端用 Groq `whisper-large-v3` 转写，再由客户端调用已有翻译接口生成普通话；不是 Whisper 的英语翻译接口。
5. 转写结果显示粤拼并可朗读；支持手动校对、重新翻译，不必重新上传音频。超过 3000 字的转写会完整保留，需缩短后翻译。

服务端不强制传 `language=zh`，用粤语风格 prompt 提示，但不能保证识别器一定保留粤语口语。噪音、静音、口音及中英夹杂可能造成漏字或幻觉，务必对照原音。

- 录音权限拒绝、不支持格式、空文件、大小超限、文件签名不符、上游限额、超时均有明确提示。
- 点击取消或离开语音标签，终止本页请求和录音，并释放麦克风、录音定时器与试听 URL。已发送到服务商的请求不保证可撤回或不计额度。
- 服务端流式读取时限制大小，并校验扩展名、MIME 和常见容器签名；音频完整解码由上游服务执行。
- STT 单进程共享每分钟最多 6 次请求；文本翻译保持每分钟 10 次的独立上限。不是生产级身份认证或全局限流。
- 音频与转写未持久化到项目文件或数据库；离开语音标签后清空本页数据。服务商的数据处理适用其政策。
- 转写 60 秒、整条客户端处理链 100 秒超时；翻译失败仍保留转写，可单独重试。

12 项测试包含模拟 STT 正常响应、格式与签名校验、鉴权失败、限额和超时；不使用真实麦克风或 API 额度。真实粤语录音识别质量需要用户设备与录音实测。免费额度取决于你的 Groq 账户；保持 Free tier。
