/**
 * db/*.sql を DATABASE_URL の PostgreSQL に適用する。
 *   npm run db:setup
 * 何度実行しても安全(冪等)。
 * (Docker コンテナでは起動のたびに自動で実行される)
 */
import { requireDatabaseUrl } from "./env.mjs";
import { applySchema } from "./schema.mjs";

/** エラーを1行にする(接続を断られたときは、中身が errors に入っていて message が空のことがある) */
function describeError(err) {
  if (!err) return "不明なエラー";
  const inner = err.errors?.[0];
  const code = err.code ?? inner?.code;
  const message = err.message || inner?.message || "";
  return [code, message].filter(Boolean).join(" ") || String(err);
}

/** Docker コンテナの中なのに、接続先が localhost(= コンテナ自身)になっているか */
function pointsToContainerItself(connectionString) {
  if (process.env.RUNNING_IN_DOCKER !== "1") return false;
  try {
    const host = new URL(connectionString).hostname.toLowerCase();
    return ["localhost", "127.0.0.1", "[::1]"].includes(host);
  } catch {
    return false;
  }
}

const connectionString = requireDatabaseUrl();

try {
  await applySchema(connectionString, {
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
  console.error(describeError(err));
  if (err && typeof err === "object" && "detail" in err && err.detail) {
    console.error(`detail: ${err.detail}`);
  }
  if (pointsToContainerItself(connectionString)) {
    console.error(
      [
        "",
        "DATABASE_URL の接続先が localhost になっています。",
        "Docker の中の localhost は、PC ではなくコンテナ自身のことです。",
        "同じPCの PostgreSQL に繋ぐには、.env.local の DATABASE_URL のホストを host.docker.internal にしてください:",
        "  DATABASE_URL=postgresql://ユーザー:パスワード@host.docker.internal:5432/stall_orders",
      ].join("\n")
    );
  }
  process.exitCode = 1;
}
