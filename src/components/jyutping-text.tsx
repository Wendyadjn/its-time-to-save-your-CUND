"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { annotateJyutping } from "@/lib/jyutping";
import { CantoneseSpeech, findCantoneseVoice, splitSentences } from "@/lib/speech";
import { Square, Volume2 } from "lucide-react";

export default function JyutpingText({ text }: { text: string }) {
  const sentences = useMemo(() => splitSentences(text).map(text => ({ text, tokens: annotateJyutping(text) })), [text]);
  const tokens = sentences.flatMap(sentence => sentence.tokens);
  const [selected, setSelected] = useState<(typeof tokens)[number] | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const player = useRef<CantoneseSpeech | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const [voiceName, setVoiceName] = useState("");

  useEffect(() => {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      setSpeechError("此浏览器不支持语音朗读，请使用支持 Web Speech API 的浏览器。");
      return;
    }
    const synth = window.speechSynthesis;
    const controller = new CantoneseSpeech(synth, text => new SpeechSynthesisUtterance(text));
    player.current = controller;
    const updateVoices = () => setVoiceName(findCantoneseVoice(synth.getVoices())?.name ?? "");
    updateVoices();
    synth.addEventListener("voiceschanged", updateVoices);
    return () => { controller.stop(); player.current = null; synth.removeEventListener("voiceschanged", updateVoices); };
  }, []);

  function stop() { player.current?.stop(); setActive(null); setPlaying(false); }

  function speak(parts: string[], sentenceIndex?: number) {
    if (!player.current) { setSpeechError("此浏览器不支持语音朗读。"); return; }
    setSpeechError(""); setActive(null); setPlaying(true);
    player.current.play(parts, index => {
      setActive(index === null ? null : (sentenceIndex ?? index));
      if (index === null) setPlaying(false);
      else setPlaying(true);
    }, message => { setSpeechError(message); setPlaying(false); });
  }

  return <div className="jyutping-learning" lang="zh-HK">
    <div className="speech-toolbar"><button className="text-action" onClick={() => speak(sentences.map(sentence => sentence.text))}><Volume2 size={16} />播放全文</button><button className="text-action" disabled={!playing} onClick={stop}><Square size={14} />停止</button><small>{voiceName ? `粤语 · ${voiceName}` : "尚未检测到粤语声线，可点击播放重新检测"}</small></div>
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
    <p role="status" className="speech-status">{speechError || (active !== null ? `正在朗读第 ${active + 1} 句` : "点击句首喇叭或句子空白处朗读整句；点击汉字查看并朗读单字。")}</p>
    <dialog ref={dialog} className="character-dialog" onCancel={stop} aria-labelledby={titleId}>
      <form method="dialog" onSubmit={stop}><button className="dialog-close" aria-label="关闭读音详情">×</button></form>
      <h3 id={titleId}>{selected?.character}</h3>
      <p>粤拼 <strong>{selected?.jyutping ?? "词库暂未收录"}</strong></p>
      <small>数字 1–6 表示粤语声调。自动注音请结合上下文核对。</small>
      <button className="primary" disabled={!selected?.jyutping} onClick={() => selected && speak([selected.character])}><Volume2 size={16} />再听一次</button>
      <p role="status" className="speech-status">{speechError || (playing ? "正在播放单字" : "")}</p>
      <p className="character-next">普通话拼音与释义将在后续阶段接入。单字声调可能与句中读音不同。</p>
    </dialog>
  </div>;
}
