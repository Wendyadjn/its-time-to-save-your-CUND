"use client";
import { useEffect, useState } from "react";

type Counter = { attempts: number; succeeded: number; failed: number; characters: number };
type Snapshot = {
  day: string; counters: Record<string, Counter>; latest: Record<string, { state: string; completedAt: number }>;
  limits: { translate: number; transcribe: number; tts: number; ttsCharacters: number };
  providers: { id: string; name: string; configured: boolean }[]; ondokuConfigured: boolean;
};
const labels: Record<string, string> = { success: "最近调用成功", rejected: "请求被拒绝，请检查连接及权限", audio_unavailable: "音频未生成，请检查账户额度", network: "网络连接被拒绝或失败", auth: "认证或权限异常", limited: "服务商额度或速率受限", timeout: "最近调用超时", failed: "最近调用失败，请查看操作提示" };
const services = [{ id: "translate", name: "文本翻译" }, { id: "transcribe", name: "语音转写" }, { id: "tts", name: "粤语朗读" }] as const;

export default function ServicesPanel({ provider }: { provider: string }) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      setLoading(true);
      try {
        const response = await fetch("/api/services", { cache: "no-store", signal: controller.signal });
        const value = await response.json();
        if (!response.ok) throw new Error(value.error || "无法读取服务状态。");
        setData(value); setError("");
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "无法读取服务状态。"); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void refresh();
    const timer = setInterval(refresh, 15000);
    window.addEventListener("services-refresh", refresh);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("services-refresh", refresh); };
  }, []);
  return <section className="services-panel" aria-label="服务与用量">
    <div className="services-heading"><h2>服务与用量</h2><button type="button" disabled={loading} onClick={() => window.dispatchEvent(new Event("services-refresh"))}>{loading ? "读取中…" : "刷新状态"}</button></div>
    <p className="service-help">显示本站最近调用结果，不会为检查状态生成文字或音频。服务商真实剩余额度：未知。</p>
    {error && <p role="alert" className="error">{error}</p>}
    {data && <>
      <p className="service-help">{data.day} · 香港时间每日重置 · 以下为本服务器所有使用者的合计用量</p>
      <div className="service-grid">{services.map(service => {
        const used = Object.entries(data.counters).filter(([key]) => key.startsWith(service.id + ":")).reduce((sum, [, row]) => sum + row.attempts, 0);
        const activeProvider = service.id === "tts" ? "ondoku" : provider;
        const rows = service.id === "tts" ? [{ id: "ondoku", name: "Ondoku · HiuGaai", configured: data.ondokuConfigured }] : data.providers;
        return <article className="service-card" key={service.id}><h3>{service.name}</h3><strong className="service-count">{used} <small>/ {data.limits[service.id]} 次</small></strong><p className="service-help">本站今日请求尝试 · 剩余 {Math.max(0, data.limits[service.id] - used)} 次</p><progress value={used} max={Math.max(1, data.limits[service.id])} aria-label={`${service.name}今日使用量`} />
          {rows.map(row => {
            const key = `${service.id}:${row.id}`, latest = data.latest[key], count = data.counters[key];
            return <div className="service-provider" key={row.id}><div><b>{row.name}</b>{activeProvider === row.id && <small>当前选择</small>}</div><span className={`service-badge state-${row.configured ? latest?.state ?? "unknown" : "missing"}`}>{!row.configured ? "未配置密钥" : latest ? labels[latest.state] ?? "状态未知" : "已配置 · 尚未调用"}</span>{latest && <small>最近结果：{new Date(latest.completedAt).toLocaleString("zh-CN", { timeZone: "Asia/Hong_Kong" })}</small>}<small>今日成功 {count?.succeeded ?? 0} · 失败 {count?.failed ?? 0} · 处理中或结果未知 {Math.max(0, (count?.attempts ?? 0) - (count?.succeeded ?? 0) - (count?.failed ?? 0))}</small></div>;
          })}
          {service.id === "tts" && <p className="service-help">今日生成请求字数：{Object.entries(data.counters).filter(([key]) => key.startsWith("tts:")).reduce((sum, [, row]) => sum + row.characters, 0)} / {data.limits.ttsCharacters} 字。复用当前页面缓存不计新请求。</p>}
        </article>;
      })}</div>
      <div className="service-notes"><p className="service-help">每日上限由站点管理员在服务器配置。失败或取消也可能产生服务商用量，因此已发出的请求不退回本站次数；切换服务不会重置次数。</p><p className="service-help">本站统计不是服务商账单。上限按请求次数与朗读输入字数限制，不是金额预算。</p><div className="service-links"><a href="https://console.groq.com/" target="_blank" rel="noreferrer">Groq 控制台 ↗</a><a href="https://cloud.siliconflow.cn/" target="_blank" rel="noreferrer">硅基流动控制台 ↗</a><a href="https://ondoku3.com/zh-hans/" target="_blank" rel="noreferrer">Ondoku 账户与额度 ↗</a></div></div>
    </>}
  </section>;
}
