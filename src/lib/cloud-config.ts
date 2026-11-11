export type CloudConfig = { url: string; key: string };

export function publicCloudConfig(url = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY): CloudConfig | null {
  if (!url?.trim() || !key?.trim()) return null;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname !== "/" && parsed.pathname !== "")) return null;
    const value = key.trim();
    let allowed = /^sb_publishable_[A-Za-z0-9_-]+$/.test(value);
    if (!allowed && value.split(".").length === 3) {
      const payload = JSON.parse(atob(value.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      allowed = payload.role === "anon";
    }
    return allowed ? { url: parsed.origin, key: value } : null;
  } catch { return null; }
}
