"use client";

import { useEffect, useRef, useState } from "react";
import VoiceRecorder from "@/components/voice-recorder";
import JyutpingText from "@/components/jyutping-text";
import { ArrowDownUp, ArrowRight, BookOpen, Check, ChevronRight, Clipboard, Copy, Languages, Mic, Sparkles, Trash2 } from "lucide-react";
import { convertScript, examples, MAX_LENGTH, resolveScript, translateDemo, type Direction, type Script } from "@/lib/translation";

export default function CantoneseApp() {
  const [tab, setTab] = useState<"text" | "voice">("text");
  const [script, setScript] = useState<Script>("auto");
  const [direction, setDirection] = useState<Direction>("mandarin-cantonese");
  const [input, setInput] = useState<string>(examples[3].mandarin);
  const [result, setResult] = useState("");
  const [outputScript, setOutputScript] = useState<Exclude<Script, "auto"> | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<"demo" | "api">("demo");
  const [loading, setLoading] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);

  function cancelRequest() {
    request.current?.abort(); request.current = null; setLoading(false);
  }
  const resolved = resolveScript(input, script);
  const source = direction === "mandarin-cantonese" ? "普通话" : "粤语（白话）";
  const target = direction === "mandarin-cantonese" ? "粤语（白话）" : "普通话";
  const displayResult = convertScript(result, outputScript ?? resolved);
  const characterCount = Array.from(input).length;

  function edit(value: string) {
    cancelRequest(); setInput(value); setResult(""); setError(""); setNotice(""); setOutputScript(null);
  }

  function chooseScript(value: Script) {
    cancelRequest(); setScript(value); setOutputScript(null);
    if (value !== "auto") setInput(convertScript(input, value));
  }

  async function translate() {
    cancelRequest(); setNotice(""); setOutputScript(null); setError(""); setResult("");
    if (mode === "demo") {
      try { setResult(translateDemo(input, direction)); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "翻译失败，请重试。"); }
      return;
    }
    const controller = new AbortController();
    request.current = controller; setLoading(true);
    const timeout = window.setTimeout(() => controller.abort(), 35_000);
    try {
      const response = await fetch("/api/translate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input, direction }), signal: controller.signal,
      });
      const data = await response.json();
      if (request.current !== controller) return;
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "翻译失败，请重试。");
      if (typeof data.translation !== "string" || !data.translation.trim()) throw new Error("服务返回的译文无效。");
      setResult(data.translation);
      setNotice("由 Groq AI 翻译，请核对语义及多音字读音。");
    } catch (cause) {
      if (request.current === controller) setError(controller.signal.aborted ? "翻译请求超时，请重试。" : cause instanceof Error ? cause.message : "无法连接翻译服务。");
    } finally {
      window.clearTimeout(timeout);
      if (request.current === controller) { request.current = null; setLoading(false); }
    }
  }

  async function paste() {
    try {
      const value = await navigator.clipboard.readText();
      if (Array.from(value).length > MAX_LENGTH) { setError(`粘贴内容超过 ${MAX_LENGTH} 字，请缩短后重试。`); return; }
      edit(script === "auto" ? value : convertScript(value, script));
    } catch { setError("无法读取剪贴板，请直接粘贴到输入框。"); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(displayResult); setNotice("已复制翻译结果"); }
    catch { setError("复制失败，请选中文本后手动复制。"); }
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="敢学粤语首页"><span className="logo">粵<span>◡</span></span><span><strong>敢学粤语<span className="brand-dot">.</span></strong><small>Olivia Cantorigo</small></span></a>
        <div className="header-right"><div className="script-switch" role="group" aria-label="全局简繁偏好">
          {([['simplified', '简'], ['traditional', '繁'], ['auto', '自动']] as const).map(([value, label]) => <button key={value} onClick={() => chooseScript(value)} aria-pressed={script === value}>{label}</button>)}
        </div></div>
      </header>

      <main>
        <section className="intro"><div className="eyebrow"><span /> 你的日常粤语学习伙伴</div><h1>感谢语音，<span>敢学粤语</span></h1></section>
        <div className="workspace-heading"><div className="tabs" role="tablist" aria-label="学习方式">
          <button id="text-tab" role="tab" aria-selected={tab === "text"} aria-controls="text-panel" onClick={() => { cancelRequest(); setTab("text"); }}><Languages size={18} />文本翻译</button>
          <button id="voice-tab" role="tab" aria-selected={tab === "voice"} aria-controls="voice-panel" onClick={() => { cancelRequest(); setTab("voice"); }}><Mic size={18} />语音转译</button>
        </div>{tab === "text" ? <label className="translation-mode">翻译方式<select aria-label="翻译方式" value={mode} onChange={event => { cancelRequest(); setMode(event.target.value as "demo" | "api"); setResult(""); setError(""); setNotice(""); }}><option value="demo">本地例句演示</option><option value="api">Groq AI 翻译</option></select></label> : <span className="demo-badge">Groq 语音识别与翻译</span>}</div>

        {tab === "text" ? <section id="text-panel" role="tabpanel" aria-labelledby="text-tab">
          <p className="mode-notice">{mode === "api" ? "API 模式：点击翻译会将输入文本发送至 Groq。需先在服务器配置密钥；免费额度以你的账户为准。" : "演示模式仅支持下方例句及其组合；任意文本请切换 Groq AI 翻译并配置密钥。"}</p>
          <div className="translation-card">
            <div className="language-row"><div><span className="language-tag">{direction === "mandarin-cantonese" ? "普" : "粤"}</span><strong>{source}</strong><span className="muted">源语言</span></div>
              <button className="swap" aria-label="交换翻译方向" onClick={() => { setDirection(direction === "mandarin-cantonese" ? "cantonese-mandarin" : "mandarin-cantonese"); edit(result ? displayResult : ""); }}><ArrowDownUp size={18} /></button>
              <div><span className="language-tag target-tag">{direction === "mandarin-cantonese" ? "粤" : "普"}</span><strong>{target}</strong><span className="muted">目标语言</span></div></div>
            <div className="panels"><div className="input-panel"><label className="sr-only" htmlFor="source-text">输入{source}</label><textarea id="source-text" value={input} onChange={(event) => edit(event.target.value)} placeholder={`输入${source}，开启一段粤语对话…`} spellCheck={false} />
              {direction === "cantonese-mandarin" && input.trim() && characterCount <= MAX_LENGTH && <section className="source-annotation" aria-label="输入粤语的粤拼标注"><span className="annotation-label">粤拼学习 · 点击汉字查看读音</span><JyutpingText key={input} text={input} /></section>}
              <div className="panel-toolbar"><div className="flex gap-4"><button className="text-action" onClick={paste}><Clipboard size={15} />粘贴</button><button className="text-action" disabled={!input} onClick={() => edit("")}><Trash2 size={15} />清空</button></div><span className={characterCount > MAX_LENGTH ? "count-over" : "muted"}>{characterCount} / {MAX_LENGTH}</span></div></div>
              <div className="output-panel"><div className="output-content" aria-live="polite">{result ? <div className="translated-text">{direction === "mandarin-cantonese" ? <JyutpingText key={displayResult} text={displayResult} /> : <p lang="zh-CN">{displayResult}</p>}</div> : <div className="empty-output"><span><Sparkles size={25} strokeWidth={1.4} /></span><p>换一种表达，一样的心意</p><small>翻译结果将在这里显示</small></div>}</div>
                <div className="panel-toolbar"><span className="muted">{direction === "mandarin-cantonese" ? "粤语发音见译文上方" : "粤语发音见输入学习区"}</span><div className="flex gap-4"><button className="text-action" disabled={!result} onClick={() => setOutputScript((outputScript ?? resolved) === "traditional" ? "simplified" : "traditional")} aria-label="切换输出简繁体">简 / 繁</button><button className="icon-action" aria-label="复制译文" disabled={!result} onClick={copy}><Copy size={16} /></button></div></div></div></div>
            <div className="card-bottom"><span><BookOpen size={15} />粤拼已开启 · 点击汉字查看读音</span><button className="primary" disabled={loading || !input.trim() || characterCount > MAX_LENGTH} onClick={translate}>{loading ? "翻译中…" : "翻译一下"}<ArrowRight size={17} /></button></div>
          </div>
          <div role="alert" className={error ? "feedback error" : "sr-only"}>{error}</div><div role="status" className={notice ? "feedback success" : "sr-only"}>{notice}</div>
          <section className="examples"><div className="section-label"><Sparkles size={16} /><h2>不如，由呢句开始</h2><span>试试这些日常表达</span></div><div className="example-grid">{examples.map((example, index) => <button className="example" key={example.label} onClick={() => edit(convertScript(direction === "mandarin-cantonese" ? example.mandarin : example.cantonese, resolved))}><span className="example-top"><span>0{index + 1} <b>{example.label}</b></span><ChevronRight size={16} /></span><span className="example-text">{convertScript(direction === "mandarin-cantonese" ? example.mandarin : example.cantonese, resolved)}</span></button>)}</div></section>
        </section> : <section id="voice-panel" role="tabpanel" aria-labelledby="voice-tab"><VoiceRecorder script={script} /></section>}

        <aside className="learning-note"><span className="note-icon">粵</span><div><strong>慢慢嚟，比较快。</strong><p>学语言不用急，每天多讲一句，就离地道粤语近一步。</p></div><span className="note-decoration" aria-hidden="true">慢慢嚟</span></aside>
        <footer><span><Check size={13} /> 粤拼 · 粤语朗读 · AI 翻译接入</span></footer>
      </main>
    </div>
  );
}
