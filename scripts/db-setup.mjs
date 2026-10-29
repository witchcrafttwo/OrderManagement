/**
 * db/*.sql を DATABASE_URL の PostgreSQL に適用する。
 *   npm run db:setup
 * 何度実行しても安全(冪等)。
 * (本番起動 npm run serve でも毎回自動で実行される)
 */
import { requireDatabaseUrl } from "./env.mjs";
import { applySchema } from "./schema.mjs";

try {
  await applySchema(requireDatabaseUrl(), {
    onConnected: (info) => {
      console.log(`接続しました: ${info.db}`);
      console.log(`${info.version}\n`);
    },
    onFile: (file, state) => {
      if (state === "missing") {
        console.warn(`- ${file} が見つかりません。スキップします。`);
      } else if (state === "start") {
        console.log(`▶ db/${file} を実行中...`);
      } else {
        console.log(`✔ db/${file} 完了\n`);
      }
    },
    onNotice: (message) => console.log(`   ${message}`),
  });
  console.log("セットアップが完了しました。");
} catch (err) {
  console.error("\nセットアップに失敗しました:");
  console.error(err instanceof Error ? err.message : err);
  if (err && typeof err === "object" && "detail" in err && err.detail) {
    console.error(`detail: ${err.detail}`);
  }
  process.exitCode = 1;
}
