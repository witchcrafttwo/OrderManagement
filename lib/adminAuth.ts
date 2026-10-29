import crypto from "node:crypto";

export const ADMIN_COOKIE = "admin_session";
export const SESSION_MAX_AGE = 60 * 60 * 8; // 8時間

/**
 * このリクエストが HTTPS で来たか。
 * リバースプロキシで HTTPS を受けている場合は x-forwarded-proto に入る。
 */
function isHttpsRequest(req: Request): boolean {
  const forwarded = req.headers.get("x-forwarded-proto");
  if (forwarded) {
    // "https, http" のように複数入ることがあるので先頭だけ見る
    return forwarded.split(",")[0].trim().toLowerCase() === "https";
  }
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * 管理者セッション Cookie の属性。
 *
 * secure は「HTTPS で開いているときだけ」付ける。
 * ブラウザは http:// のページで Secure 付き Cookie を保存しないため、
 * 固定で付けると LAN 内の http://192.168.x.x:3000 からログインできなくなる。
 */
export function adminCookieOptions(req: Request) {
  return {
    httpOnly: true, // JavaScript から読めないようにする
    secure: isHttpsRequest(req),
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

function sessionSecret(): string {
  return (
    process.env.ADMIN_SESSION_SECRET ??
    "insecure-dev-secret-please-set-ADMIN_SESSION_SECRET"
  );
}

/** 署名付きセッショントークンを発行する */
export function createSessionToken(): string {
  const exp = Date.now() + SESSION_MAX_AGE * 1000;
  const payload = `admin.${exp}`;
  const sig = crypto
    .createHmac("sha256", sessionSecret())
    .update(payload)
    .digest("hex");
  return `${payload}.${sig}`;
}

/** セッショントークンの署名と有効期限を検証する */
export function verifySessionToken(token?: string | null): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [role, exp, sig] = parts;
  const payload = `${role}.${exp}`;
  const expected = crypto
    .createHmac("sha256", sessionSecret())
    .update(payload)
    .digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  if (Number(exp) < Date.now()) return false;
  return true;
}

/** 入力パスワードを管理者パスワードとタイミング安全に比較する */
export function verifyAdminPassword(input: unknown): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || typeof input !== "string") return false;
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
