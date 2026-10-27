"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDownUp, ArrowRight, AudioLines, BookOpen, Check, Copy, Languages, Mic, Sparkles } from "lucide-react";
import JyutpingText from "@/components/jyutping-text";
import VoiceRecorder from "@/components/voice-recorder";
import { convertScript, examples, resolveScript, translateDemo, type Script } from "@/lib/translation";
import styles from "@/app/design-lab/design-lab.module.css";

const concepts = [
  { id: "editorial", number: "01", name: "港式字报", english: "THE CANTO DAILY", description: "像翻开一份会说话的香港文化报。朱红、纸色、大字与细线，文字本身就是主角。", tags: "文化感 / 大字排版 / 编辑式布局" },
  { id: "studio", number: "02", name: "声音实验室", english: "CANTO SOUND STUDIO", description: "把语言学习变成一场声音采样。深色控制台、荧光提示与清晰音轨，适合专注听读。", tags: "声音感 / 深色控制台 / 高对比" },
  { id: "notebook", number: "03", name: "口语手账", english: "A LITTLE CANTO CLUB", description: "几何装饰背景、便签卡片、统一宋体。译文、播放控制、逐句粤拼分区显示。", tags: "亲近感 / 便签字卡 / 轻松玩味" },
] as const;

export default function NotebookApp({ preview = false }: { preview?: boolean }) {
  const [concept, setConcept] = useState(2);
  const [tab, setTab] = useState<"text" | "voice">("text");
  const [script, setScript] = useState<Script>("auto");
  const [reverse, setReverse] = useState(false);
  const [input, setInput] = useState<string>(examples[3].mandarin);
  const [result, setResult] = useState<string>(examples[3].cantonese);
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"demo" | "api">("demo");
  const [loading, setLoading] = useState(false);
  const [outputScript, setOutputScript] = useState<"simplified" | "traditional" | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);
  function cancel() { request.current?.abort(); request.current = null; setLoading(false); }
  function edit(value: string) { cancel(); setInput(value); setResult(""); setMessage(""); setOutputScript(null); }
  async function translate() {
    cancel(); setMessage(""); setResult(""); setOutputScript(null);
    if (mode === "demo") {
      try { setResult(translateDemo(input, reverse ? "cantonese-mandarin" : "mandarin-cantonese")); }
      catch(error) { setMessage(error instanceof Error ? error.message : "翻译失败，请重试。"); }
      return;
    }
    const controller = new AbortController(); request.current = controller; setLoading(true);
    const timeout = window.setTimeout(() => controller.abort(), 35000);
    try {
      const response = await fetch("/api/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: input, direction: reverse ? "cantonese-mandarin" : "mandarin-cantonese" }), signal: controller.signal });
      const data = await response.json();
      if (request.current !== controller) return;
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "翻译失败，请重试。");
      if (typeof data.translation !== "string" || !data.translation.trim()) throw new Error("服务返回的译文无效。");
      setResult(data.translation); setMessage("翻译完成，请核对语义和读音。");
    } catch(error) {
      if (request.current === controller) setMessage(controller.signal.aborted ? "翻译请求超时，请重试。" : error instanceof Error ? error.message : "无法连接翻译服务。");
    } finally { window.clearTimeout(timeout); if (request.current === controller) { request.current = null; setLoading(false); } }
  }
  async function paste() {
    try { const text = await navigator.clipboard.readText(); if (Array.from(text).length > 3000) {setMessage("粘贴内容超过 3000 字，请缩短后重试。");return;} edit(text); }
    catch { setMessage("无法读取剪贴板，请直接粘贴到输入框。"); }
  }
  const current = concepts[concept];
  const resolved = resolveScript(input, script);
  const output = convertScript(result, outputScript ?? resolved);

  function loadExample(index: number) {
    cancel(); setOutputScript(null);
    const example = examples[index];
    setInput(reverse ? example.cantonese : example.mandarin);
    setResult(reverse ? example.mandarin : example.cantonese);
    setMessage("");
  }

  return <div className={`${styles.lab} ${!preview ? styles.live : ""}`}>
    {preview && <div className={styles.picker}>
      <div className={styles.pickerTitle}><span>OLIVIA / DESIGN STUDIES</span><Link href="/">返回当前网页 ↗</Link></div>
      <div className={styles.options} role="group" aria-label="设计方案">{concepts.map((item, index) => <button key={item.id} aria-pressed={concept === index} onClick={() => { setConcept(index); setMessage(""); }}><span>{item.number}</span><strong>{item.name}</strong><small>{item.tags}</small>{concept === index && <Check size={16} />}</button>)}</div>
      <p>{current.description}<span>交互 demo · 翻译使用本地例句，语音播放与录音处理使用现有 API 额度。</span></p>
    </div>}

    <div className={`${styles.preview} ${styles[current.id]}`}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}><span className={styles.brandMark}>敢</span><span><strong>敢学粤语</strong><small>Olivia Cantorigo</small></span></Link>
        <div className={styles.headerMeta}><span>{current.english}</span><b>粵 / 普</b></div>
        <div className={styles.script} role="group" aria-label="简繁偏好">{([['auto', '自动'], ['simplified', '简'], ['traditional', '繁']] as const).map(([value, label]) => <button key={value} aria-pressed={script === value} onClick={() => { cancel(); setScript(value); setOutputScript(null); }}>{label}</button>)}</div>
      </header>

      <div className={styles.body}>
        <aside className={styles.rail}><span>OC / 01</span><div>听 · 读 · 讲</div><small>TEXT / AUDIO</small></aside>
        <section className={styles.hero}>
          <div className={styles.heroCopy}><span className={styles.kicker}>{concept === 0 ? "语言生活刊 / LANGUAGE & EVERYDAY" : concept === 1 ? "YOUR DAILY LISTENING SESSION" : "粤普翻译 / 粤拼 / 语音转写"}</span><h1>感谢语音，<br/><em>敢学粤语<span>。</span></em></h1></div>
          <div className={styles.heroArt} aria-hidden="true">{concept === 0 ? <><span className={styles.issue}>VOL. 001<br/>日常口语特辑</span><strong>講</strong><span className={styles.artCaption}>文字 / 发音 / 粤拼</span></> : concept === 1 ? <><span className={styles.recordLabel}>CANTO / STEREO</span><div className={styles.disc}><span>粵</span></div><div className={styles.wave}>{[12,28,40,23,55,36,70,46,24,50,68,32,45,22,38,56,30,16].map((height,i) => <i key={i} style={{height}} />)}</div></> : <><span className={styles.sticker}>粵 / 普<br/>語音 · 文字</span><div className={styles.noteWord}><small>jam2 caa4</small><strong>飲茶</strong><span>一齐去，好唔好？</span></div><span className={styles.doodle}>jam2 / caa4</span></>}</div>
        </section>

        <nav className={styles.nav} aria-label="学习方式"><div><button aria-pressed={tab === "text"} onClick={() => { cancel(); setTab("text"); }}><Languages size={17}/><span>{concept === 1 ? "01 / TEXT TRACK" : "文本翻译"}</span></button><button aria-pressed={tab === "voice"} onClick={() => { cancel(); setTab("voice"); }}><Mic size={17}/><span>{concept === 1 ? "02 / VOICE TRACK" : "语音转译"}</span></button></div><span>{tab === "text" ? "双向翻译 · 简繁转换" : "感谢语音，更需要眼"}</span></nav>

        {!preview && tab === "text" && <div className={styles.modeBar}><label>翻译方式<select aria-label="翻译方式" value={mode} onChange={event => { cancel(); setMode(event.target.value as "demo" | "api"); setResult(""); setMessage(""); }}><option value="demo">本地例句演示</option><option value="api">Groq AI 翻译</option></select></label><small>{mode === "api" ? "翻译文字会发送至 Groq，使用账户额度。" : "演示支持下方例句及其组合；自由文本请选择 AI 翻译。"}</small></div>}
        <section className={styles.workspace} aria-label={tab === "text" ? "文本翻译" : "语音转译"}>
          {tab === "text" ? <>
            <div className={styles.inputCard}><div className={styles.cardTop}><span><b>01</b> {reverse ? "粤语原文" : "普通话原文"}</span><small>INPUT</small></div><label className="sr-only" htmlFor="demo-input">输入原文</label><textarea id="demo-input" value={convertScript(input, resolved)} onChange={event => edit(event.target.value)} /><div className={styles.inputBottom}><span>{Array.from(input).length} / 3000</span><div><button onClick={paste}>粘贴</button><button disabled={!input} onClick={() => edit("")}>清空</button></div></div>{reverse && input.trim() && Array.from(input).length <= 3000 && <JyutpingText key={`input-${input}`} text={convertScript(input,resolved)} />}<div className={styles.translateActions}><button className={styles.swap} aria-label="交换翻译方向" onClick={() => { cancel(); setReverse(!reverse); edit(result ? output : ""); }}><ArrowDownUp size={18}/></button><button className={styles.translate} disabled={loading || !input.trim() || Array.from(input).length > 3000} onClick={translate}>{loading ? "翻译中…" : "翻译这句话"} <ArrowRight size={17}/></button></div></div>
            <div className={styles.outputCard}><div className={styles.cardTop}><span><b>02</b> {reverse ? "普通话表达" : "粤语白话"}</span><button disabled={!result} onClick={() => setOutputScript((outputScript ?? resolved) === "traditional" ? "simplified" : "traditional")}>简 / 繁</button><button disabled={!result} aria-label="复制译文" onClick={async () => {try {await navigator.clipboard.writeText(output);setMessage("已复制译文");}catch {setMessage("请选中译文手动复制。");}}}><Copy size={15}/></button></div>{result ? <><p className={styles.translation}>{output}</p><div className={styles.annotationLabel}><AudioLines size={15}/> {reverse ? "普通话译文" : "粤拼与发音"}</div>{!reverse && <JyutpingText key={output} text={output}/>}</> : <div className={styles.empty}><Sparkles size={30}/><p>{loading ? "正在生成译文…" : "翻译结果将在此显示。"}</p></div>}</div>
          </> : <div className={styles.voice}><VoiceRecorder script={script}/></div>}
        </section>
        <p className={styles.feedback} role="status">{message}</p>
        {tab === "text" && <section className={styles.examples}><div className={styles.examplesTitle}><span>{concept === 0 ? "日常切片" : concept === 1 ? "QUICK SAMPLES" : "常用例句"}</span><small>点击任意卡片试用 <ArrowRight size={13}/></small></div><div className={styles.exampleGrid}>{examples.map((example,index) => <button key={example.label} onClick={() => loadExample(index)}><span className={styles.exampleNumber}>0{index+1} <small>{example.label}</small></span><strong>{convertScript(example.cantonese,resolved)}</strong><span>{example.mandarin}</span><ArrowRight size={17}/></button>)}</div></section>}
        <footer className={styles.footer}><span>Olivia Cantorigo</span><span>粤普翻译 / 粤拼标注 / 语音转译</span><BookOpen size={17}/></footer>
      </div>
    </div>
  </div>;
}
