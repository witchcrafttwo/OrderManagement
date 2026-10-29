import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { projectRoot, sslOption } from "./env.mjs";

/** 適用する SQL ファイル(この順に実行する。どれも何度実行しても安全) */
export const SQL_FILES = ["schema.sql", "cleanup.sql"];

/**
 * db/*.sql をデータベースに適用する。
 * npm run db:setup と、本番起動(scripts/serve.mjs)の両方から使う。
 *
 * @param {string} connectionString DATABASE_URL
 * @param {{
 *   onConnected?: (info: { db: string, version: string }) => void,
 *   onFile?: (file: string, state: "start" | "done" | "missing") => void,
 *   onNotice?: (message: string) => void,
 * }} [hooks]
 * @returns {Promise<{ db: string, version: string }>} 接続先の情報
 */
export async function applySchema(connectionString, hooks = {}) {
  const client = new Client({
    connectionString,
    ssl: sslOption(),
    connectionTimeoutMillis: 10_000,
  });
  // 接続が途中で切れたときの 'error' を拾っておかないとプロセスごと落ちる
  client.on("error", () => {});
  if (hooks.onNotice) {
    client.on("notice", (msg) => {
      if (msg?.message) hooks.onNotice(msg.message);
    });
  }

  try {
    await client.connect();
    const { rows } = await client.query(
      "select current_database() as db, version() as version"
    );
    const info = {
      db: rows[0].db,
      version: String(rows[0].version).split(",")[0],
    };
    hooks.onConnected?.(info);

    for (const file of SQL_FILES) {
      const filePath = path.join(projectRoot, "db", file);
      if (!fs.existsSync(filePath)) {
        hooks.onFile?.(file, "missing");
        continue;
      }
      hooks.onFile?.(file, "start");
      // 1回のクエリで送るので、ファイル全体が1トランザクションとして実行される
      await client.query(fs.readFileSync(filePath, "utf8"));
      hooks.onFile?.(file, "done");
    }

    return info;
  } finally {
    await client.end().catch(() => {});
  }
}
