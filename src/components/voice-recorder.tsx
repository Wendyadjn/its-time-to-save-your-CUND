"use client";

import { useEffect, useRef, useState } from "react";
import { AudioLines, Mic, Square, Upload, X } from "lucide-react";
import JyutpingText from "./jyutping-text";
import { AUDIO_ACCEPT, MAX_AUDIO_BYTES, MAX_RECORD_SECONDS, recordingExtension, validateAudio } from "@/lib/audio";
import { convertScript, MAX_LENGTH, resolveScript, type Script } from "@/lib/translation";

export default function VoiceRecorder({ script }: { script: Script }) {
  const [status, setStatus] = useState<"idle" | "requesting" | "recording" | "transcribing" | "translating">("idle");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [translation, setTranslation] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const session = useRef(0);
  const request = useRef<AbortController | null>(null);
  const busy = status === "transcribing" || status === "translating";
  const recording = status === "recording" || status === "requesting";
  const resolved = resolveScript(transcript, script);
  const text = convertScript(transcript, resolved);

  function releaseMicrophone() {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
  }

  useEffect(() => () => {
    session.current++;
    request.current?.abort(); request.current = null;
    if (recorder.current?.state === "recording") recorder.current.stop();
    releaseMicrophone();
  }, []);

  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function chooseFile(value: File) {
    const invalid = validateAudio(value);
    if (invalid) { setError(invalid); return; }
    setFile(value); setTranscript(""); setTranslation(""); setError(""); setNotice("");
  }

  function cancel() {
    session.current++;
    request.current?.abort(); request.current = null;
    if (recorder.current?.state === "recording") recorder.current.stop();
    recorder.current = null; releaseMicrophone(); setStatus("idle"); setNotice("已取消；已有转写结果仍保留。");
  }

  async function startRecording() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("此浏览器无法录音。请使用 HTTPS / localhost 和支持录音的浏览器，或上传音频。"); return;
    }
    setError(""); setNotice(""); setStatus("requesting");
    const current = ++session.current;
    let media: MediaStream | null = null;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (current !== session.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find(type => MediaRecorder.isTypeSupported(type));
      if (!mime) throw new Error("浏览器没有支持的录音格式，请上传 MP3、WAV 或 M4A。");
      const capture = new MediaRecorder(media, { mimeType: mime });
      recorder.current = capture;
      const chunks: Blob[] = [];
      let size = 0;
      capture.ondataavailable = event => {
        if (current !== session.current || !event.data.size) return;
        size += event.data.size;
        if (size > MAX_AUDIO_BYTES) { cancel(); setError("录音超过 10 MB，已停止并丢弃本次录音，请缩短后重录。"); return; }
        chunks.push(event.data);
      };
      capture.onerror = () => {
        if (current === session.current) { cancel(); setError("录音中断，请检查麦克风后重试。"); }
      };
      capture.onstop = () => {
        if (current !== session.current) return;
        releaseMicrophone(); recorder.current = null; setStatus("idle");
        const blob = new Blob(chunks, { type: capture.mimeType });
        chooseFile(new File([blob], `cantonese-recording.${recordingExtension(capture.mimeType)}`, { type: capture.mimeType }));
      };
      media.getAudioTracks().forEach(track => track.addEventListener("ended", () => {
        if (current === session.current && capture.state === "recording") capture.stop();
      }, { once: true }));
      capture.start(1000); setSeconds(0); setStatus("recording");
      const started = Date.now();
      timer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - started) / 1000); setSeconds(elapsed);
        if (elapsed >= MAX_RECORD_SECONDS && capture.state === "recording") { capture.stop(); releaseMicrophone(); }
      }, 1000);
    } catch (cause) {
      media?.getTracks().forEach(track => track.stop());
      if (current !== session.current) return;
      releaseMicrophone(); recorder.current = null; setStatus("idle");
      setError(cause instanceof DOMException && cause.name === "NotAllowedError" ? "麦克风权限被拒绝，请在浏览器设置中允许，或上传音频。" : cause instanceof Error ? cause.message : "无法启动录音。");
    }
  }

  async function processAudio(translateOnly = false) {
    if (!translateOnly && !file) return;
    setError(""); setNotice(""); setTranslation("");
    if (!translateOnly) setTranscript("");
    const controller = new AbortController(); request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 100_000);
    let recognized = transcript;
    try {
      if (!translateOnly) {
        setStatus("transcribing");
        const form = new FormData(); form.set("file", file!);
        const response = await fetch("/api/transcribe", { method: "POST", body: form, signal: controller.signal });
        const data = await response.json();
        if (request.current !== controller) return;
        if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "语音转写失败。");
        if (typeof data.text !== "string" || !data.text.trim()) throw new Error("未识别到有效文字。");
        recognized = data.text; setTranscript(recognized);
      }
      if (!recognized.trim() || Array.from(recognized).length > MAX_LENGTH) throw new Error(`已保留转写内容，请在文本框中调整为 1–${MAX_LENGTH} 字后点击“翻译普通话”。`);
      setStatus("translating");
      const response = await fetch("/api/translate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: recognized, direction: "cantonese-mandarin" }), signal: controller.signal,
      });
      const data = await response.json();
      if (request.current !== controller) return;
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "普通话翻译失败，可保留转写后重试。");
      if (typeof data.translation !== "string" || !data.translation.trim()) throw new Error("翻译返回了无效文本，请重试。");
      setTranslation(data.translation); setNotice("转写与翻译完成，请核对原音；可编辑转写后重新翻译。");
    } catch (cause) {
      if (request.current === controller) setError(controller.signal.aborted ? "请求超时，请缩短音频后重试。已有转写结果仍保留。" : cause instanceof Error ? cause.message : "处理失败，请重试。");
    } finally {
      window.clearTimeout(timeout);
      if (request.current === controller) { request.current = null; setStatus("idle"); }
    }
  }

  return <div className="voice-workspace">
    <div className="voice-panel">
      <span className={`voice-icon ${status === "recording" ? "is-recording" : ""}`}><AudioLines size={38} /></span>
      <span className="eyebrow">听见粤语，读懂心意</span><h2>把你听到的，变成看得懂的。</h2>
      <p>点击录音或上传文件，停止录音后可先试听，再开始转写。</p>
      <div className="record-controls">
        {status === "recording" ? <button className="primary" onClick={() => { if (recorder.current?.state === "recording") recorder.current.stop(); releaseMicrophone(); }}><Square size={17} />停止录音 · {seconds}s</button>
          : <button className="primary" disabled={busy || recording} onClick={startRecording}><Mic size={18} />{status === "requesting" ? "等待麦克风权限…" : "开始录音"}</button>}
        {(busy || recording) && <button className="text-action" onClick={cancel}><X size={16} />取消</button>}
      </div>
      <label className={`audio-upload ${busy || recording ? "is-disabled" : ""}`}><Upload size={21} /><strong>选择音频文件</strong><small>MP3 · WAV · M4A · WebM · OGG，最大 10 MB</small><input type="file" accept={AUDIO_ACCEPT} disabled={busy || recording} onChange={event => { const value = event.target.files?.[0]; if (value) chooseFile(value); event.target.value = ""; }} /></label>
      <small>录音最长 {MAX_RECORD_SECONDS} 秒；音频与转写文字会发送至 Groq，使用账户免费额度。</small>
      {file && <div className="audio-preview"><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(2)} MB</small>{preview && <audio key={preview} controls src={preview} preload="metadata" />}<button className="primary" disabled={busy || recording} onClick={() => processAudio()}>{status === "transcribing" ? "正在转写…" : status === "translating" ? "正在翻译…" : "开始转写并翻译"}</button></div>}
    </div>
    <p role="alert" className={error ? "feedback error" : "sr-only"}>{error}</p>
    <p role="status" className="feedback success">{busy ? (status === "transcribing" ? "正在识别粤语录音…" : "转写已保留，正在翻译普通话…") : notice}</p>
    <div className="voice-results">
      <section><h3>粤语转写 <small>可校对编辑</small></h3><label className="sr-only" htmlFor="voice-transcript">粤语转写文本</label><textarea id="voice-transcript" value={transcript} disabled={busy || recording} placeholder="识别结果将在这里显示…" onChange={event => { setTranscript(event.target.value); setTranslation(""); setError(""); setNotice(""); }} />
        {text && Array.from(text).length <= MAX_LENGTH && <JyutpingText key={text} text={text} />}
        <button className="text-action" disabled={!transcript.trim() || busy || recording || Array.from(transcript).length > MAX_LENGTH} onClick={() => processAudio(true)}>翻译普通话（无需再次上传）</button>
      </section>
      <section><h3>普通话翻译</h3><p className="voice-translation" lang="zh-CN">{translation ? convertScript(translation, resolved) : "转写完成后自动翻译；翻译失败时仍保留粤语原文。"}</p></section>
    </div>
    <p className="mode-notice">自动转写可能漏字、误识别或将粤语写成普通话，请对照原音校对。本页不自动保存音频或转写，离开标签页后会清除。</p>
  </div>;
}
