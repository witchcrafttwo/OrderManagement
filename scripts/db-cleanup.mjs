/**
 * 使われていない古い部屋を削除する。
 *   npm run db:cleanup          (既定 30 日)
 *   npm run db:cleanup -- 60    (60 日)
 *
 * pg_cron が使えないサーバーでは、OS のスケジューラからこれを呼んでください。
 */
import { Client } from "pg";
import { requireDatabaseUrl, sslOption } from "./env.mjs";

const days = Number(process.argv[2] ?? process.env.CLEANUP_DAYS ?? 30);
if (!Number.isInteger(days) || days < 1) {
  console.error(`日数の指定が不正です: ${process.argv[2]}`);
  process.exit(1);
}

const client = new Client({
  connectionString: requireDatabaseUrl(),
  ssl: sslOption(),
});

try {
  await client.connect();
  const { rows } = await client.query(
    "select public.cleanup_old_rooms($1) as deleted",
    [days]
  );
  console.log(`${days} 日以上使われていない部屋を ${rows[0].deleted} 件削除しました。`);
} catch (err) {
  console.error("クリーンアップに失敗しました:");
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
