import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** プロジェクトのルートディレクトリ */
export const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

/**
 * .env.local / .env を読み込んで process.env に入れる。
 * すでに環境変数が設定されている場合は上書きしない
 * (サーバー本番環境では OS の環境変数を優先させたいため)。
 */
export function loadEnvFiles() {
  for (const file of [".env.local", ".env"]) {
    const filePath = path.join(projectRoot, file);
    if (!fs.existsSync(filePath)) continue;

    for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const eq = line.indexOf("=");
      if (eq < 0) continue;

      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

/**
 * DATABASE_URL を取り出す。未設定ならメッセージを出して終了する。
 */
export function requireDatabaseUrl() {
  loadEnvFiles();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      [
        "DATABASE_URL が設定されていません。",
        ".env.local に次の形式で書いてください:",
        "",
        "  DATABASE_URL=postgresql://ユーザー名:パスワード@localhost:5432/stall_orders",
        "",
        "(.env.local.example を参考にしてください)",
      ].join("\n")
    );
    process.exit(1);
  }
  return url;
}

/**
 * DATABASE_SSL の値から pg 用の ssl オプションを作る。
 *   disable(既定) : SSL を使わない  … LAN 内の自前サーバーはこれでOK
 *   require        : SSL を使い、証明書も検証する
 *   no-verify      : SSL を使うが証明書は検証しない(自己署名証明書向け)
 */
export function sslOption() {
  switch ((process.env.DATABASE_SSL ?? "disable").toLowerCase()) {
    case "require":
      return { rejectUnauthorized: true };
    case "no-verify":
      return { rejectUnauthorized: false };
    default:
      return false;
  }
}
