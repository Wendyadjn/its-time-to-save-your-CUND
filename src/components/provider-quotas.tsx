"use client";
import { useEffect, useState } from "react";
import { parseOndokuCheck, type GroqQuota, type OndokuCheck, type RateWindow } from "@/lib/provider-quota";

const time = (value: number) => new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Hong_Kong" });
export default function ProviderQuotas({ groqQuota, ondokuAccount, ondokuIssue }: { groqQuota: (GroqQuota & { model: string })[]; ondokuAccount: string | null; ondokuIssue: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(timer); }, []);
  function rate(window: RateWindow | null, label: string) {
    if (!window) return <p className="service-help">{label}：接口未返回</p>;
    const expired = window.resetsAt === null || now >= window.resetsAt;
    return <p className="service-help">{label}：{expired ? "待更新（旧窗口已到期或未提供重置时间）" : `上次响应剩余 ${window.remaining ?? "未知"} / ${window.limit ?? "未知"}`}{window.resetsAt !== null && <small className="quota-time">窗口重置：{time(window.resetsAt)}</small>}</p>;
  }
  return <section aria-label="服务商官方额度" className="provider-quotas">
    <h3>服务商额度</h3><p className="service-help">与下方“本站每日上限”分别计算。刷新只读取已有记录，不消耗模型额度。</p>
    <div className="service-grid">
      <article className="service-card"><h3>Ondoku · 剩余字数</h3>{ondokuIssue && <p className="service-help error">最近朗读未生成所需音频，可能额度不足；请核对账户剩余字数。此错误不能确定剩余为 0。</p>}{ondokuAccount ? <OndokuQuota key={ondokuAccount} account={ondokuAccount} /> : <p className="service-help">请先配置 Ondoku Token。</p>}</article>
      <article className="service-card"><h3>Groq · 官方速率额度</h3><p className="service-help">来源：真实调用的响应头；按组织及模型限制，不是付费余额。其他应用也会消耗额度。</p>{groqQuota.length ? groqQuota.map(row => <div className="service-provider" key={row.model}><b>{row.model}</b><small>采样：{time(row.observedAt)}</small>{rate(row.requests, "每日请求")}{rate(row.tokens, "每分钟 Token")}</div>) : <p className="service-help">尚未取得官方数据。下一次 Groq 翻译或转写收到额度响应头后显示；不为查询而额外调用模型。</p>}<p className="service-help">语音小时／每日秒数若未返回，则仍未知，不用请求次数推算。</p><a href="https://console.groq.com/settings/limits" target="_blank" rel="noreferrer">查看官方限制 ↗</a></article>
      <article className="service-card"><h3>硅基流动 · 账户余额</h3><strong className="service-count">需到官方核对</strong><p className="service-help">国内站已于 2026-08-14 停用原余额查询接口。目前无法自动读取，不把未知显示为 0，也不根据请求次数估算金额。</p><a href="https://cloud.siliconflow.cn/" target="_blank" rel="noreferrer">打开账户与费用账单 ↗</a></article>
    </div>
  </section>;
}

function OndokuQuota({ account }: { account: string }) {
  const storageKey = `canto-ondoku-quota:${account}`;
  const [check, setCheck] = useState<OndokuCheck | null>(null);
  const [remaining, setRemaining] = useState("");
  const [renewalDate, setRenewalDate] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    try {
      const value = parseOndokuCheck(JSON.parse(localStorage.getItem(storageKey) ?? "null"));
      setCheck(value); if (value) { setRemaining(String(value.remaining)); setRenewalDate(value.renewalDate); }
    } catch { setError("无法读取本浏览器的核对记录。"); }
  }, [storageKey]);
  const expired = check && new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()) >= check.renewalDate;
  return <>
    <span className={`service-badge ${check?.remaining === 0 || expired ? "state-limited" : "state-unknown"}`}>{check ? expired ? "已到所填更新日 · 请重新核对" : check.remaining === 0 ? "上次核对已用完" : "手动核对快照 · 非实时" : "真实剩余未知"}</span>
    {check && <><strong className="service-count">{check.remaining.toLocaleString()} <small>字 · 上次核对</small></strong><p className="service-help">核对时间：{time(check.checkedAt)}<br />账户更新日（手动填写）：{check.renewalDate}</p></>}
    <p className="service-help">标准语音接口不返回剩余字数。未注册试用 1,000 字／月，免费注册账户 5,000 字／月；以你的账户页为准。</p>
    <a href="https://ondoku3.com/en/users/setting/" target="_blank" rel="noreferrer">到 Ondoku 核对剩余字数 ↗</a>
    <details className="quota-edit"><summary>记录刚核对的额度</summary><form onSubmit={event => {
      event.preventDefault();
      const value = remaining.trim() ? parseOndokuCheck({ remaining: Number(remaining), renewalDate, checkedAt: Date.now() }) : null;
      if (!value) { setError("请填写有效的剩余字数及账户更新日期。"); return; }
      try { localStorage.setItem(storageKey, JSON.stringify(value)); setCheck(value); setError(""); }
      catch { setError("浏览器不允许保存记录，请检查存储设置。"); }
    }}><label>账户页剩余字数<input type="number" min="0" max="100000000" step="1" required value={remaining} onChange={event => setRemaining(event.target.value)} /></label><label>账户页下次更新日期<input type="date" required value={renewalDate} onChange={event => setRenewalDate(event.target.value)} /></label><button type="submit">保存核对记录</button></form></details>
    {error && <p className="service-help error" role="alert">{error}</p>}
    <p className="service-help">只保存在本浏览器，不更改官方额度。核对后的本站朗读、Ondoku 官网和其他应用用量不会自动扣减此快照，请定期重新核对。日期到达时仅提示更新，不自动恢复额度。</p>
  </>;
}
