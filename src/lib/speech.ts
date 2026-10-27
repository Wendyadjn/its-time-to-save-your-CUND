export function splitSentences(text: string): string[] {
  return text.match(/[^。！？!?；;\n]+[。！？!?；;\n]*|[。！？!?；;\n]+/gu) ?? [];
}

export function findCantoneseVoice<T extends { lang: string; name: string }>(voices: T[]): T | undefined {
  return voices.find(voice => /^(zh[-_]hk|yue)([-_]|$)/i.test(voice.lang))
    ?? voices.find(voice => /cantonese|粤语|粵語|廣東話|广东话/i.test(voice.name));
}

export class CantoneseSpeech {
  private generation = 0;
  private utterance: SpeechSynthesisUtterance | null = null;

  constructor(
    private synth: SpeechSynthesis,
    private createUtterance: (text: string) => SpeechSynthesisUtterance,
  ) {}

  stop() {
    this.generation++;
    this.synth.cancel();
    this.utterance = null;
  }

  play(sentences: string[], onSentence: (index: number | null) => void, onError: (message: string) => void) {
    this.stop();
    const voice = findCantoneseVoice(this.synth.getVoices());
    if (!voice) { onError("未找到粤语声线。请在系统中安装粤语语音，或使用提供粤语声线的浏览器。"); return; }
    const generation = this.generation;
    const chunks = sentences.flatMap((sentence, index) =>
      (sentence.match(/[\s\S]{1,160}/gu) ?? []).filter(text => /[\p{L}\p{N}]/u.test(text)).map(text => ({ text, index })));
    if (!chunks.length) { onError("没有可朗读的文字。"); return; }
    let position = 0;
    const next = () => {
      if (generation !== this.generation) return;
      const chunk = chunks[position++];
      if (!chunk) { this.utterance = null; onSentence(null); return; }
      try {
        const utterance = this.createUtterance(chunk.text);
        this.utterance = utterance;
        utterance.voice = voice;
        utterance.lang = voice.lang;
        utterance.rate = 0.9;
        utterance.onstart = () => { if (generation === this.generation) onSentence(chunk.index); };
        utterance.onend = next;
        utterance.onerror = event => {
          if (generation !== this.generation) return;
          this.stop(); onSentence(null);
          onError(`粤语播放失败（${event.error}），请重试或检查系统语音设置。`);
        };
        this.synth.speak(utterance);
      } catch {
        this.stop(); onSentence(null); onError("无法启动粤语播放，请检查浏览器的语音功能。");
      }
    };
    next();
  }
}
