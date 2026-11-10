export function playAudioSegment(audio: HTMLAudioElement, start: number, end: number, onError: () => void): () => void {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) { onError(); return () => {}; }
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const cleanup = () => {
    stopped = true;
    clearInterval(timer);
    audio.removeEventListener("ended", cleanup);
  };
  const stop = () => { cleanup(); audio.pause(); };
  try {
    audio.pause();
    audio.currentTime = start;
    audio.addEventListener("ended", cleanup);
    // timeupdate 的间隔可能较长，短轮询避免复听越过片段末尾。
    timer = setInterval(() => {
      if (audio.currentTime >= end) { stop(); audio.currentTime = end; }
      else if (audio.currentTime < start) stop();
      else if (audio.paused && audio.currentTime > start) cleanup();
    }, 25);
    void audio.play().catch(() => { if (!stopped) { stop(); onError(); } });
  } catch { stop(); onError(); }
  return stop;
}
