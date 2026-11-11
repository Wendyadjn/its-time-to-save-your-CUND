"use client";
import { useEffect, useState } from "react";
import { useCloudHistory } from "./cloud-history";
import type { HistoryItem, HistorySummary } from "@/lib/history";
import JyutpingText from "./jyutping-text";

export default function HistoryPanel({ onOpen }: { onOpen: (item: HistoryItem) => void }) {
  const cloud = useCloudHistory();
  if (!cloud.configured) return <section className="history-panel"><h2>历史记录</h2><p className="cloud-help">云端历史尚未连接。请填写项目连接资料并执行 Supabase 数据库权限脚本；当前翻译和录音仍可使用。</p></section>;
  if (!cloud.user) return <section className="history-panel"><h2>历史记录</h2><p className="cloud-help">登录后查看自己保存的文字和原音，可在不同设备继续学习。</p><button className="primary" onClick={cloud.requestLogin}>登录 / 注册</button></section>;
  return <SignedHistory key={cloud.user.id} onOpen={onOpen} />;
}
function SignedHistory({ onOpen }: { onOpen: (item: HistoryItem) => void }) {
  const cloud = useCloudHistory();
  const [items, setItems] = useState<HistorySummary[]>([]);
  const [selected, setSelected] = useState<HistoryItem | null>(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [reload, setReload] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(""); setItems([]);
    void cloud.api(`/api/history?page=${page}&q=${encodeURIComponent(query)}`, { signal: controller.signal }).then(async response => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "无法读取历史。");
      if (!controller.signal.aborted) { setItems(data.items); setHasMore(data.hasMore); setTotal(data.total); }
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "无法读取历史。"); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, query, reload]); // api 随账号重新挂载，避免同一账号下反复读取。
  async function open(id: string) {
    setAction(true); setError(""); setConfirmDelete(null);
    try {
      const response = await cloud.api(`/api/history?id=${id}`); const data = await response.json();
      if (!response.ok) throw new Error(data.error || "无法打开历史。");
      setSelected(data); if (data.audioUnavailable) setError("这条记录的原音暂时无法读取；文字仍保留，可重新打开后重试。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "无法打开历史。"); }
    finally { setAction(false); }
  }
  async function remove(id: string) {
    setAction(true); setError("");
    try {
      const response = await cloud.api(`/api/history?id=${id}`, { method: "DELETE" }); const data = await response.json();
      if (!response.ok) throw new Error(data.error || "删除失败。");
      if (selected?.id === id) setSelected(null);
      setConfirmDelete(null); setPage(0); setReload(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "删除失败。"); }
    finally { setAction(false); }
  }
  return <section className="history-panel"><div className="services-heading"><h2>历史记录</h2><button disabled={action} onClick={async () => { const result = await cloud.client?.auth.signOut({ scope: "local" }); if (result?.error) setError("退出失败，请重试。"); }}>退出登录</button></div><p className="cloud-help">{cloud.user?.email} · 仅显示当前账号保存的内容 · 共 {total} 条</p>
    <form className="history-search" onSubmit={event => { event.preventDefault(); setPage(0); setQuery(search.trim()); setReload(value => value + 1); }}><label className="sr-only" htmlFor="history-search">搜索历史标题</label><input id="history-search" maxLength={80} placeholder="搜索标题" value={search} onChange={event => setSearch(event.target.value)} /><button disabled={loading}>搜索 / 刷新</button></form>
    {error && <p role="alert" className="cloud-help error">{error}</p>}
    {loading ? <p className="cloud-help" role="status">正在读取历史…</p> : !items.length ? <p className="cloud-help">没有找到记录。可在翻译或语音转译区点击“保存到历史”。</p> : <div className="history-list">{items.map(item => <article key={item.id}><div><button className="history-title" disabled={action} onClick={() => open(item.id)}>{item.title}</button><small className="cloud-help">{item.kind === "voice" ? "语音转译" : "文本翻译"} · {new Date(item.created_at).toLocaleString("zh-CN")} {item.audio_path ? "· 已保存原音" : "· 仅文字"}</small></div>{confirmDelete === item.id ? <div className="history-delete"><small>同时删除已保存原音，无法恢复。</small><button disabled={action} onClick={() => remove(item.id)}>确认删除</button><button disabled={action} onClick={() => setConfirmDelete(null)}>取消</button></div> : <button disabled={action} onClick={() => setConfirmDelete(item.id)}>删除</button>}</article>)}</div>}
    <div className="history-pagination"><button disabled={loading || page === 0} onClick={() => setPage(value => value - 1)}>上一页</button><small>第 {page + 1} 页</small><button disabled={loading || !hasMore} onClick={() => setPage(value => value + 1)}>下一页</button></div>
    {selected && <article className="history-detail"><div className="services-heading"><h3>{selected.title}</h3><button onClick={() => setSelected(null)}>关闭详情</button></div><small className="cloud-help">保存于 {new Date(selected.createdAt).toLocaleString("zh-CN")} · 最后处理服务：{selected.provider}</small>{selected.audioUrl && <audio key={selected.audioUrl} controls src={selected.audioUrl} preload="metadata" />}<h4>{selected.kind === "voice" ? "校对后的粤语原文" : "原文"}</h4><p>{selected.sourceText}</p>{selected.originalText && selected.originalText !== selected.sourceText && <details><summary>原始机器转写</summary><p>{selected.originalText}</p></details>}<h4>译文</h4><p>{selected.resultText || "保存时尚无译文。"}</p>{selected.direction === "mandarin-cantonese" && selected.resultText && <JyutpingText text={selected.resultText} />}<button className="primary" onClick={() => onOpen(selected)}>载入工作区继续编辑</button><p className="cloud-help">编辑后再次保存会生成一条新记录。音频播放地址有效一小时，失效时重新打开这条记录。</p></article>}
  </section>;
}
