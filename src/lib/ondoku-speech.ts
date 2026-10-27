// shortcut: 仅缓存当前页面最近 100 条音频地址，刷新后清除；长期学习库需持久化缓存。
const cache = new Map<string, string>();

export class OndokuSpeech {
  private generation = 0;
  private rate = 1;
  private request: AbortController | null = null;
  private audio: HTMLAudioElement | null = null;
  private finish: (() => void) | null = null;

  constructor(private createAudio = () => new Audio(), private send: typeof fetch = (...args) => globalThis.fetch(...args)) {}

  setRate(rate: number) {
    if (![1, 1.25, 1.5, 2].includes(rate)) throw new RangeError("不支持的播放倍速");
    this.rate = rate;
    if (this.audio) { this.audio.defaultPlaybackRate = rate; this.audio.playbackRate = rate; }
  }

  stop() {
    this.generation++;
    this.request?.abort(); this.request = null;
    if (this.audio) {
      this.audio.onplaying = null; this.audio.onended = null; this.audio.onerror = null; this.audio.onloadedmetadata = null;
      this.audio.pause(); this.audio.removeAttribute("src"); this.audio.load(); this.audio = null;
    }
    this.finish?.(); this.finish = null;
  }

  async play(parts: string[], onActive: (index: number | null) => void, onError: (message: string) => void) {
    this.stop();
    const generation = this.generation;
    onActive(null);
    try {
      for (let i = 0; i < parts.length; i++) {
        const text = parts[i].trim();
        if (!/[\p{L}\p{N}]/u.test(text)) continue;
        onActive(null);
        const audio = this.createAudio(); this.audio = audio;
        let url = cache.get(text);
        if (!url) {
          // 在点击手势仍有效时解锁同一个音频元素，避免等待生成后被浏览器拦截。
          audio.src = "data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQIAAAAAAA==";
          void audio.play().catch(() => {});
        }
        if (!url) {
          const controller = new AbortController(); this.request = controller;
          const response = await this.send("/api/tts", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(65000)]),
          });
          const data = await response.json();
          if (generation !== this.generation) return;
          if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "语音生成失败。");
          if (typeof data.url !== "string") throw new Error("音频地址无效。");
          url = data.url;
          if (cache.size >= 100) cache.delete(cache.keys().next().value!);
          cache.set(text, url!); this.request = null;
        }
        if (generation !== this.generation) return;
        audio.defaultPlaybackRate = this.rate;
        audio.preservesPitch = true;
        await new Promise<void>((resolve, reject) => {
          this.finish = resolve;
          const applyRate = () => { audio.defaultPlaybackRate = this.rate; audio.playbackRate = this.rate; };
          audio.onloadedmetadata = applyRate;
          audio.onplaying = () => { if (generation === this.generation) { applyRate(); onActive(i); } };
          audio.onended = () => resolve();
          audio.onerror = () => { cache.delete(text); reject(new Error("音频加载失败，请再次点击播放。")); };
          audio.src = url!;
          applyRate();
          audio.play().catch(() => reject(new Error("浏览器未允许播放，请再次点击播放；或检查网络与浏览器音频设置。")));
        });
        if (generation !== this.generation) return;
        audio.onplaying = null; audio.onended = null; audio.onerror = null; audio.onloadedmetadata = null;
        audio.removeAttribute("src"); audio.load(); this.audio = null; this.finish = null;
      }
      if (generation === this.generation) { this.stop(); onActive(null); }
    } catch (error) {
      if (generation !== this.generation) return;
      this.stop(); onActive(null);
      onError(error instanceof Error ? error.message : "语音播放失败，请重试。");
    }
  }
}
