import { HttpError } from "./http";

interface RateLimitResult {
  request_count: number;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function enforceRateLimit(
  db: D1Database,
  request: Request,
  tenantId: string,
  action: string,
  limit: number,
  windowSeconds = 60
): Promise<void> {
  const ip = request.headers.get("CF-Connecting-IP")?.slice(0, 64) || "unknown";
  const userAgent = request.headers.get("User-Agent")?.slice(0, 160) || "unknown";
  const clientSignal = ip === "unknown" ? `ua:${userAgent}` : `ip:${ip}`;
  const keyHash = await sha256(`${tenantId}\n${action}\n${clientSignal}`);
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + windowSeconds * 1000).toISOString();
  const cleanupBefore = new Date(now.getTime() - 86_400_000).toISOString();
  const results = await db.batch([
    db.prepare("DELETE FROM public_rate_limits WHERE expires_at < ?").bind(cleanupBefore),
    db.prepare(`
      INSERT INTO public_rate_limits (key_hash, action, window_started_at, request_count, expires_at)
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(key_hash, action) DO UPDATE SET
        window_started_at = CASE
          WHEN public_rate_limits.expires_at <= excluded.window_started_at THEN excluded.window_started_at
          ELSE public_rate_limits.window_started_at
        END,
        request_count = CASE
          WHEN public_rate_limits.expires_at <= excluded.window_started_at THEN 1
          ELSE public_rate_limits.request_count + 1
        END,
        expires_at = CASE
          WHEN public_rate_limits.expires_at <= excluded.window_started_at THEN excluded.expires_at
          ELSE public_rate_limits.expires_at
        END
      RETURNING request_count
    `).bind(keyHash, action, nowIso, expiresAt)
  ]);
  const count = (results[1].results[0] as unknown as RateLimitResult | undefined)?.request_count;
  if (!count || count > limit) {
    throw new HttpError(429, "RATE_LIMITED", "Muitas tentativas. Aguarde um momento.");
  }
}
