"use client";

import { useState } from "react";
import { AudioLines, Copy } from "lucide-react";
import JyutpingText from "./jyutping-text";
import { convertScript, resolveScript, type Script } from "@/lib/translation";
import styles from "@/app/design-lab/design-lab.module.css";

export default function CantoneseReader({ text, onChange, script }: { text: string; onChange: (text: string) => void; script: Script }) {
  const [outputScript, setOutputScript] = useState<"simplified" | "traditional" | null>(null);
  const [message, setMessage] = useState("");
  const resolved = resolveScript(text, script);
  const output = convertScript(text, outputScript ?? resolved);
  const length = Array.from(text).length;
  const valid = Boolean(text.trim()) && length <= 12000;
  function edit(value: string) { onChange(value); setOutputScript(null); setMessage(""); }
  return <>
    <section className={styles.workspace} aria-label="粤语朗读">
      <div className={`${styles.inputCard} ${styles.readerCard}`}>
        <div className={styles.cardTop}><span>粤语朗读</span>
          <button type="button" disabled={!valid} onClick={() => setOutputScript((outputScript ?? resolved) === "traditional" ? "simplified" : "traditional")}>简 / 繁</button>
          <button type="button" disabled={!valid} aria-label="复制粤语文本" onClick={async () => { try { await navigator.clipboard.writeText(output); setMessage("已复制粤语文本。"); } catch { setMessage("请选中文本手动复制。"); } }}><Copy size={15} /></button>
        </div>
        <label className="sr-only" htmlFor="cantonese-reader-input">输入粤语段落</label>
        <textarea id="cantonese-reader-input" value={text} placeholder="输入或粘贴粤语段落" onChange={event => edit(event.target.value)} />
        <div className={styles.inputBottom}><span>{length} / 12000</span><div>
          <button type="button" onClick={async () => { try { const value = await navigator.clipboard.readText(); if (Array.from(value).length > 12000) { setMessage("粘贴内容超过 12000 字，请缩短后重试。"); return; } edit(value); } catch { setMessage("无法读取剪贴板，请直接粘贴到输入框。"); } }}>粘贴</button>
          <button type="button" disabled={!text} onClick={() => edit("")}>清空</button>
        </div></div>
        <p className="service-help">直接显示粤拼，不调用翻译服务；点击播放才使用 Ondoku 朗读额度。</p>
        {valid ? <><div className={styles.annotationLabel}><AudioLines size={15} /> 粤拼与发音</div><JyutpingText key={output} text={output} /></> : <div className={styles.empty}><AudioLines size={30} /><p>{length > 12000 ? "内容超过 12000 字，请缩短后朗读。" : "输入粤语后，在这里查看粤拼与播放发音。"}</p></div>}
      </div>
    </section>
    <p className={styles.feedback} role="status">{message}</p>
  </>;
}
