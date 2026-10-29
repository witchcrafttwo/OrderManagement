import { Pool, types, type PoolClient, type QueryResultRow } from "pg";

/**
 * 自前サーバーの PostgreSQL への接続層。
 * サーバー側(API Route / Server Component)専用。
 * 絶対にクライアント(ブラウザ)側で import しないこと。
 */

// -------------------------------------------------------------
// 型パーサ:
//   pg は timestamptz を JS の Date で返すが、このアプリの型定義
//   (lib/types.ts)は ISO 8601 文字列を前提にしている。
//   JSON にしたときと Server Component から渡したときで形が
//   変わらないよう、ここで ISO 文字列に統一しておく。
//   ※ OID を number 型にしているのは pg の型定義の都合
// -------------------------------------------------------------
const OID_TIMESTAMP: number = 1114; // timestamp without time zone
const OID_TIMESTAMPTZ: number = 1184; // timestamp with time zone

const globalForDb = globalThis as typeof globalThis & {
  __pgPool?: Pool;
  __pgTypesReady?: boolean;
};

if (!globalForDb.__pgTypesReady) {
  globalForDb.__pgTypesReady = true;
  for (const oid of [OID_TIMESTAMP, OID_TIMESTAMPTZ]) {
    const base = types.getTypeParser(oid);
    types.setTypeParser(oid, (value: string) => {
      const parsed = base(value);
      return parsed instanceof Date ? parsed.toISOString() : parsed;
    });
  }
}

/**
 * DATABASE_SSL の値から ssl オプションを作る。
 *   disable(既定) : SSL なし … LAN 内の自前サーバーはこれでOK
 *   require       : SSL あり + 証明書を検証
 *   no-verify     : SSL あり + 証明書は検証しない(自己署名証明書向け)
 */
function sslOption() {
  switch ((process.env.DATABASE_SSL ?? "disable").toLowerCase()) {
    case "require":
      return { rejectUnauthorized: true };
    case "no-verify":
      return { rejectUnauthorized: false };
    default:
      return false;
  }
}

/** 接続設定(プールと LISTEN 用クライアントで共有する) */
export function connectionConfig(applicationName: string) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL が未設定です。.env.local に " +
        "DATABASE_URL=postgresql://ユーザー:パスワード@ホスト:5432/DB名 を設定してください。"
    );
  }
  return {
    connectionString,
    ssl: sslOption(),
    application_name: applicationName,
  };
}

function createPool(): Pool {
  const pool = new Pool({
    ...connectionConfig("stall-order-manager"),
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  // アイドル中の接続が切れても落ちないようにする(サーバー再起動時など)
  pool.on("error", (err) => {
    console.error("[db] アイドル接続でエラーが発生しました:", err.message);
  });

  return pool;
}

/** 接続プール(開発中の HMR でも 1 個だけ使い回す) */
export function getPool(): Pool {
  if (!globalForDb.__pgPool) {
    globalForDb.__pgPool = createPool();
  }
  return globalForDb.__pgPool;
}

/** SELECT などを実行して行の配列を返す */
export async function query<T extends QueryResultRow>(
  sql: string,
  params: readonly unknown[] = []
): Promise<T[]> {
  const result = await getPool().query<T>(sql, params as unknown[]);
  return result.rows;
}

/** 1行だけ取り出す(0行なら null) */
export async function queryOne<T extends QueryResultRow>(
  sql: string,
  params: readonly unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** 影響を受けた行数を返す(UPDATE / DELETE 用) */
export async function execute(
  sql: string,
  params: readonly unknown[] = []
): Promise<number> {
  const result = await getPool().query(sql, params as unknown[]);
  return result.rowCount ?? 0;
}

/**
 * トランザクション。コールバックが例外を投げたら ROLLBACK する。
 *   const order = await transaction(async (tx) => { ... });
 */
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** PostgreSQL のエラーコードを取り出す(例: 23505 = unique_violation) */
export function pgErrorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

/** 一意制約違反(23505)かどうか */
export function isUniqueViolation(err: unknown): boolean {
  return pgErrorCode(err) === "23505";
}
