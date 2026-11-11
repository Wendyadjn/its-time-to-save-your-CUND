export type RateWindow = { limit: number | null; remaining: number | null; resetsAt: number | null };
export type GroqQuota = { observedAt: number; requests: RateWindow | null; tokens: RateWindow | null };
export function parseGroqQuota(headers: Headers, now = Date.now()): GroqQuota | null {
  const count = (key: string) => {
    const value = headers.get(key);
    return value !== null && /^\d{1,15}$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
  };
  const window = (unit: string): RateWindow | null => {
    const limit = count(`x-ratelimit-limit-${unit}`), remaining = count(`x-ratelimit-remaining-${unit}`);
    if (limit === null && remaining === null) return null;
    const reset = headers.get(`x-ratelimit-reset-${unit}`) ?? "";
    let duration = 0;
    if (/^(?:\d+(?:\.\d+)?(?:ms|[dhms]))+$/.test(reset) && reset.length <= 80) {
      for (const part of reset.matchAll(/(\d+(?:\.\d+)?)(ms|[dhms])/g)) duration += Number(part[1]) * ({ d: 86400000, h: 3600000, m: 60000, s: 1000, ms: 1 }[part[2]]!);
    }
    return { limit, remaining, resetsAt: duration > 0 && duration <= 7 * 86400000 ? now + duration : null };
  };
  const requests = window("requests"), tokens = window("tokens");
  return requests || tokens ? { observedAt: now, requests, tokens } : null;
}

export type OndokuCheck = { remaining: number; checkedAt: number; renewalDate: string };
export function parseOndokuCheck(value: unknown): OndokuCheck | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.remaining !== "number" || !Number.isSafeInteger(row.remaining) || row.remaining < 0 || row.remaining > 100000000
    || typeof row.checkedAt !== "number" || !Number.isFinite(row.checkedAt) || row.checkedAt <= 0 || row.checkedAt > Date.now()
    || typeof row.renewalDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.renewalDate)
    || !Number.isFinite(Date.parse(row.renewalDate)) || new Date(row.renewalDate).toISOString().slice(0, 10) !== row.renewalDate) return null;
  return { remaining: row.remaining, checkedAt: row.checkedAt, renewalDate: row.renewalDate };
}
