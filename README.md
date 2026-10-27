# 粤语通 CantoneseMaster

Step 1–4 完整本地实现。Next.js App Router + React + TypeScript + Tailwind CSS 4 + Lucide。

## 启动

需要 Node.js 20.9 或以上版本。

```sh
npm install
npm run dev
```

打开 http://localhost:3000。

```sh
npm test
npm run typecheck
npm run build
```

## 当前目录与职责

```text
cantonese-master/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # HTML 语言、标题、全局样式
│   │   ├── page.tsx                # App Router 页面入口
│   │   └── globals.css             # Tailwind 入口、响应式视觉样式
│   ├── components/
│   │   └── cantonese-app.tsx       # Header、Tabs、双栏翻译、语音占位页
│   └── lib/
│       └── translation.ts          # 简繁转换、演示词库、双向翻译、输入校验
├── tests/
│   └── translation.test.ts         # 双向、简繁、段落、错误边界测试
├── package.json
├── package-lock.json
├── tsconfig.json
├── next-env.d.ts
├── postcss.config.mjs
└── .gitignore
```

Step 3 已新增 `src/components/jyutping-text.tsx`、`src/lib/jyutping.ts` 和 `tests/jyutping.test.ts`。后续规划：

```text
src/components/voice-recorder.tsx   # Step 5：录音、上传与转写状态
src/app/api/translate/route.ts      # 正式翻译服务代理，密钥留在服务器
src/app/api/transcribe/route.ts     # 如使用外部 STT，服务器处理上传
```

## 安装依赖

运行依赖：`next`、`react`、`react-dom`、`lucide-react`、`opencc-js`。

开发依赖：`typescript`、`@types/node`、`@types/react`、`@types/react-dom`、`tailwindcss`、`@tailwindcss/postcss`、`tsx`。

```sh
npm install next react react-dom lucide-react opencc-js@1.4.2
npm install -D typescript @types/node @types/react @types/react-dom tailwindcss@4 @tailwindcss/postcss@4 tsx
```

首次安装后用 lockfile 锁定实际版本。后续复现用 `npm ci`。Step 3 新增 `to-jyutping@3.1.1`；无需 Zustand 或语音 SDK，状态使用 React Hooks。

构建脚本使用 Next.js 内置 Webpack，绕开本机 Turbopack CSS 编译时的端口权限限制。

## Step 1

- Header、品牌与全局简体 / 繁体 / 自动切换。
- 文本翻译和语音转译 Tabs，可在移动端使用。
- 双栏输入与结果卡片、方向交换、字符计数、例句入口。
- 空白、禁用、成功、错误状态和键盘焦点样式。
- 语音界面只展示规划，无模拟录音或伪造转写结果。

## Step 2

- `translateDemo` 按完整句子查内置双向例句词库，支持多个已收录句子和换行组合。
- 未收录文本会明确报错，不做错误率高的逐词替换，也不会把原文假装成译文。
- 简繁转换使用 OpenCC 的香港繁体与大陆简体转换，独立于粤普语言翻译。
- 全局手动偏好会转换输入及输出；“自动”保留输入，输出跟随输入字形。检测到任一可转简字形即视为繁体，混合文本同样按此规则；纯共用汉字默认简体。这是字形启发式规则，不做语言识别。
- 输出卡片可单独切换简繁，复制的是当前显示的文本。
- 输入变化时清除结果，避免旧译文与新输入错配；方向交换优先把现有译文放入输入，没有译文时清空。
- 粘贴超过 3000 字会拒绝；手动输入超限会显示红色计数并禁用翻译，不会悄悄截断文本。
- 翻译和注音在浏览器内执行，无密钥、外部翻译请求或存储；语音合成是否联网由系统声线决定。
- 剪贴板需浏览器权限及 HTTPS 或 localhost 环境，失败时提供手动操作提示。

## 后续接入

Step 3 已完成：使用 [to-jyutping](https://github.com/CanCLID/to-jyutping) 对全文一次注音，再逐字用 Ruby 标签对齐渲染。输入粤语时，输入框下方即时显示学习区（上限 3000 字）；输出粤语时，译文直接展示粤拼。简繁字形、标点、换行、英文和 emoji 均保留。未收录汉字显示 `—`，点击后说明词库未收录，不编造读音。

点字后打开原生 dialog 读音卡片，支持键盘 Enter / Space 打开、Esc 或关闭按钮关闭，并由浏览器管理焦点。字卡当前展示粤拼与声调说明；普通话拼音、释义及发音尚未接入。自动注音可能误判多音字，应结合语境校读。

Step 4 已完成：`src/lib/speech.ts` 集中处理浏览器 TTS，使用 `zh-HK`、`yue` 或明确标记为 Cantonese / 粤语的声线；不回退普通话。监听 `voiceschanged` 更新声线，每次播放重新获取声线。

- 粤语学习区有“播放全文”和“停止”。每句句首喇叭及句子空白可单独播放该句，汉字点击不触发整句播放。
- 点击汉字打开字卡并播放单字，字卡可再次播放；未收录读音的字不自动朗读。孤立字的 TTS 读音可能与语境粤拼不同，当前未接入可强制指定粤拼的第三方 TTS。
- 播放由原生 `onstart` / `onend` 更新句子高亮；长句按最多 160 个 Unicode 码点分段，保留全部文字。分段可能有短暂停顿，不依赖各浏览器支持程度不同的 boundary 事件。
- 播放新句/单字、修改文字、切换简繁或方向、离开文本标签页时，取消旧队列，并忽略旧回调。关闭字卡停止单字播放。
- 无语音 API、无粤语声线、纯标点或播放错误均有明确反馈。
- 9 项自动测试覆盖字形对齐、分句、分段、声线筛选、取消后的旧回调及错误处理；测试用模拟语音引擎，实际声音质量与声线可用性仍取决于设备和浏览器。
- 项目不增加第三方 TTS 依赖或 API 密钥。浏览器/系统声线可能联网处理朗读文字，不能保证所有语音都在本地合成。

Step 5：实现真实录音或语音识别能力检测、录音资源释放、音频类型/大小限制及 STT 服务；浏览器识别支持程度不同。调用正式翻译或 STT 服务时，经服务器路由读取环境变量，禁止将 API 密钥放到客户端。

当前不提供点字释义、普通话拼音、录音、上传或任意文本真实翻译。这些属于后续阶段或生产服务接入范围，页面已明确说明。
本次只交付本地源码，未注册或发布托管站点。
