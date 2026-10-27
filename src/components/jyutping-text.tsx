"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { annotateJyutping } from "@/lib/jyutping";
import { splitSentences } from "@/lib/speech";
import { OndokuSpeech } from "@/lib/ondoku-speech";
import { Square, Volume2 } from "lucide-react";

export default function JyutpingText({ text }: { text: string }) {
  const sentences = useMemo(() => splitSentences(text).map(text => ({ text, tokens: annotateJyutping(text) })), [text]);
  const tokens = sentences.flatMap(sentence => sentence.tokens);
  const [selected, setSelected] = useState<(typeof tokens)[number] | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const player = useRef<OndokuSpeech | null>(null);
  const playback = useRef(0);
  const [active, setActive] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [speechError, setSpeechError] = useState("");
  useEffect(() => {
    const controller = new OndokuSpeech();
    player.current = controller;
    return () => { playback.current++; controller.stop(); player.current = null; };
  }, []);

  function stop() { playback.current++; player.current?.stop(); setActive(null); setPlaying(false); }

  function speak(parts: string[], sentenceIndex?: number) {
    if (!player.current) { setSpeechError("播放器尚未就绪，请重试。"); return; }
    const current = ++playback.current;
    setSpeechError(""); setActive(null); setPlaying(true);
    void player.current.play(parts, index => {
      setActive(index === null ? null : (sentenceIndex ?? index));
      if (index !== null) setPlaying(true);
    }, message => { setSpeechError(message); setPlaying(false); }).then(() => {
      if (playback.current !== current) return;
      setActive(null); setPlaying(false);
    });
  }

  const speedControl = <label className="speech-speed">倍速<select aria-label="粤语播放倍速" value={rate} onChange={event => { const value = Number(event.target.value); player.current?.setRate(value); setRate(value); }}>{[1, 1.25, 1.5, 2].map(value => <option key={value} value={value}>x{value}</option>)}</select></label>;

  return <div className="jyutping-learning" lang="zh-HK">
    <div className="speech-toolbar"><button className="text-action" onClick={() => speak(sentences.map(sentence => sentence.text))}><Volume2 size={16} />播放全文</button><button className="text-action" disabled={!playing} onClick={stop}><Square size={14} />停止</button>{speedControl}<small>粤语 · HiuGaai · <a href="https://ondoku3.com/zh-hans/" target="_blank" rel="noreferrer">语音由 Ondoku 提供</a></small></div>
    <p className="jyutping-text" aria-label="粤语文本与粤拼">
      {sentences.map((sentence, sentenceIndex) => <span key={sentenceIndex} className={active === sentenceIndex ? "speech-sentence is-speaking" : "speech-sentence"} onClick={() => speak([sentence.text], sentenceIndex)}>
      <button className="sentence-play" aria-label={`朗读第 ${sentenceIndex + 1} 句`} onClick={event => { event.stopPropagation(); speak([sentence.text], sentenceIndex); }}><Volume2 size={13} /></button>
      {sentence.tokens.map((token, index) => token.isHan ? <button
        key={index}
        type="button"
        className="jyutping-character"
        aria-label={`${token.character}，${token.jyutping ?? "暂无粤拼"}，查看读音`}
        aria-haspopup="dialog"
        onClick={event => { event.stopPropagation(); setSelected(token); dialog.current?.showModal(); if (token.jyutping) speak([token.character], sentenceIndex); }}
      ><ruby>{token.character}<rp>（</rp><rt>{token.jyutping ?? "—"}</rt><rp>）</rp></ruby></button> : <span key={index}>{token.character}</span>)}
      </span>)}
    </p>
    <details className="speech-privacy"><summary>语音服务与额度说明</summary><p>播放文字会发送至 Ondoku，生成音频使用账户字数额度，服务会保留生成历史。</p></details>
    <p role="status" className="speech-status">{speechError || (playing && active === null ? "正在准备 Ondoku 音频…" : active !== null ? `正在朗读第 ${active + 1} 句` : "句首按钮播放整句，点击汉字查看读音。")}</p>
    <dialog ref={dialog} className="character-dialog" onCancel={stop} aria-labelledby={titleId}>
      <form method="dialog" onSubmit={stop}><button className="dialog-close" aria-label="关闭读音详情">×</button></form>
      <h3 id={titleId}>{selected?.character}</h3>
      <p>粤拼 <strong>{selected?.jyutping ?? "词库暂未收录"}</strong></p>
      <small>数字 1–6 表示粤语声调。自动注音请结合上下文核对。</small>
      <button className="primary" disabled={!selected?.jyutping} onClick={() => selected && speak([selected.character])}><Volume2 size={16} />再听一次</button>
      {speedControl}
      <p role="status" className="speech-status">{speechError || (playing ? "正在准备或播放单字" : "")}</p>
      <p className="character-next">普通话拼音与释义将在后续阶段接入。单字声调可能与句中读音不同。</p>
    </dialog>
  </div>;
}
