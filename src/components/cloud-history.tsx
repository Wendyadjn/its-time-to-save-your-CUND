"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { CloudConfig } from "@/lib/cloud-config";
import type { HistoryDraft } from "@/lib/history";

type CloudContext = { configured: boolean; client: SupabaseClient | null; user: User | null; requestLogin: () => void; api: (url: string, init?: RequestInit) => Promise<Response> };
const Cloud = createContext<CloudContext>({ configured: false, client: null, user: null, requestLogin() {}, api: async () => { throw new Error("云端历史尚未配置。"); } });
export const useCloudHistory = () => useContext(Cloud);

export function CloudHistoryProvider({ config, children }: { config: CloudConfig | null; children: React.ReactNode }) {
  const [client] = useState(() => config ? createClient(config.url, config.key) : null);
  const [user, setUser] = useState<User | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const identity = useRef<string | null>(null);
  useEffect(() => {
    if (!client) return;
    let active = true;
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      identity.current = session?.user.id ?? null;
      setUser(session?.user ?? null);
      if (session?.user) { setAuthOpen(false); setPassword(""); }
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [client]);
  useEffect(() => { if (authOpen) dialog.current?.showModal(); else { dialog.current?.close(); setPassword(""); } }, [authOpen]);
  async function api(url: string, init: RequestInit = {}) {
    if (!client) throw new Error("云端历史尚未配置。");
    const { data } = await client.auth.getSession();
    if (!data.session) { setAuthOpen(true); throw new Error("请先登录后再访问历史。"); }
    const id = data.session.user.id;
    const headers = new Headers(init.headers); headers.set("Authorization", `Bearer ${data.session.access_token}`);
    const response = await fetch(url, { ...init, headers, cache: "no-store", signal: AbortSignal.any([...(init.signal ? [init.signal] : []), AbortSignal.timeout(90000)]) });
    if (identity.current !== id) throw new Error("登录账号已改变，请在当前账号下重试。");
    if (response.status === 401) setAuthOpen(true);
    return response;
  }
  async function authenticate(event: React.FormEvent) {
    event.preventDefault(); if (!client) return;
    setBusy(true); setMessage("");
    try {
      const response = register ? await client.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin } }) : await client.auth.signInWithPassword({ email: email.trim(), password });
      if (response.error) { setMessage(response.error.code === "email_not_confirmed" ? "请先在邮件中确认邮箱后再登录。" : register ? "注册未完成，请检查邮箱、密码及注册速率限制后重试。" : "登录失败，请检查邮箱、密码及网络后重试。"); return; }
      if (register && !response.data.session) setMessage("请查收确认邮件，确认后返回本页登录。未收到邮件时请检查垃圾邮件及 Supabase 邮件配置。");
    } catch { setMessage("登录服务连接失败，请稍后重试。"); }
    finally { setBusy(false); }
  }
  return <Cloud.Provider value={{ configured: Boolean(client), client, user, requestLogin: () => { setMessage(""); setAuthOpen(true); }, api }}>{children}
    <dialog className="cloud-auth-dialog" ref={dialog} onCancel={() => setAuthOpen(false)} aria-labelledby="cloud-auth-title">
      <button type="button" className="dialog-close" aria-label="关闭登录" onClick={() => setAuthOpen(false)}>×</button>
      <h2 id="cloud-auth-title">{register ? "注册学习账号" : "登录学习账号"}</h2>
      <p className="cloud-help">账号用于保存私有历史记录。未点击保存时，不会将当前文字或原音留存到 Supabase。</p>
      <form onSubmit={authenticate}><label>邮箱<input type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></label><label>密码<input type="password" required minLength={6} maxLength={256} autoComplete={register ? "new-password" : "current-password"} value={password} onChange={event => setPassword(event.target.value)} /></label><button className="primary" disabled={busy}>{busy ? "处理中…" : register ? "注册" : "登录"}</button></form>
      <button type="button" className="text-action" disabled={busy} onClick={() => { setRegister(!register); setMessage(""); }}>{register ? "已有账号，去登录" : "还没有账号，去注册"}</button><p className="cloud-help" role="status">{message}</p>
    </dialog>
  </Cloud.Provider>;
}

export function SaveHistory({ draft, audio, disabled = false }: { draft: HistoryDraft; audio?: File | null; disabled?: boolean }) {
  const cloud = useCloudHistory();
  const [includeAudio, setIncludeAudio] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const generation = useRef(0);
  const saving = useRef(false);
  useEffect(() => { generation.current++; setMessage(""); setIncludeAudio(false); }, [draft.sourceText, draft.resultText, audio, cloud.user?.id]);
  useEffect(() => () => { generation.current++; }, []);
  async function save() {
    if (!cloud.user) { cloud.requestLogin(); return; }
    if (saving.current) return;
    saving.current = true;
    const current = ++generation.current;
    const form = new FormData(); form.set("record", JSON.stringify(draft));
    if (includeAudio && audio) form.set("audio", audio);
    setBusy(true); setMessage("");
    try {
      const response = await cloud.api("/api/history", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存失败，当前内容仍保留。");
      if (generation.current === current) setMessage(data.duplicate ? "这份内容已保存，无需重复保存。" : includeAudio && audio ? "文字和原音已保存到私有历史。" : "文字已保存到私有历史。");
    } catch (cause) { if (generation.current === current) setMessage(cause instanceof Error ? cause.message : "保存失败，请稍后重试。"); }
    finally { saving.current = false; setBusy(false); }
  }
  return <div className="history-save">
    {audio && <label className="cloud-help"><input type="checkbox" checked={includeAudio} disabled={busy} onChange={event => setIncludeAudio(event.target.checked)} />同时保存这份原音到私有云端</label>}
    <button type="button" className="text-action" disabled={!cloud.configured || (Boolean(cloud.user) && (disabled || busy || !draft.sourceText.trim()))} onClick={save}>{busy ? "保存中…" : cloud.user ? "保存到历史" : "登录后保存到历史"}</button>
    <small className="cloud-help" role="status">{message || (!cloud.configured ? "云端历史尚未配置，可继续使用翻译和录音功能。" : "仅在点击保存时留存；原音默认不保存。")}</small>
  </div>;
}
