/**
 * 本番サーバーの起動スクリプト。
 *   npm run serve        (Windows なら start-server.cmd のダブルクリックでも同じ)
 *
 * 起動するたびに次を自動で行う:
 *   1. 更新の確認   … git で管理していれば、リモートの更新を取り込む(fast-forward のみ)
 *   2. 依存パッケージ … package-lock.json と node_modules がずれていればインストール
 *   3. ビルド       … 前回のビルドからソースが変わったときだけビルドする。
 *                     失敗したら前回のビルドに戻して、そのまま起動する
 *   4. データベース  … db/*.sql を適用する(何度実行しても安全)
 *   5. 起動         … next start。ほかの端末から開くアドレスも表示する
 *
 * オプション:
 *   --no-pull   git の更新確認をしない(環境変数 AUTO_PULL=0 でも同じ)
 *   --rebuild   変更がなくてもビルドし直す
 * 環境変数(.env.local に書いてもよい):
 *   PORT        待ち受けるポート(既定 3000)
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFiles, projectRoot } from "./env.mjs";
import { applySchema } from "./schema.mjs";

// ---------------------------------------------------------------
// 設定
// ---------------------------------------------------------------

const DIST_DIR = path.join(projectRoot, ".next");
/** 最後に成功したビルドの記録 */
const STAMP_FILE = path.join(DIST_DIR, "serve-build.json");
/** ビルド中に前回のビルドを退避しておく場所(ビルドで消されない cache の中) */
const BACKUP_DIR = path.join(DIST_DIR, "cache", "serve-previous-build");
/** next build が消さずに残すもの(next/dist/build/index.js の clean と同じ条件) */
const KEEP_IN_DIST = /^(cache|dev|lock)/;

/** ビルド結果に影響するもの。ここが変わったらビルドし直す */
const SOURCE_DIRS = ["app", "components", "lib", "public"];
const SOURCE_FILES = [
  "package.json",
  "package-lock.json",
  "next.config.mjs",
  "tailwind.config.ts",
  "postcss.config.mjs",
  "tsconfig.json",
];
/** NEXT_PUBLIC_ で始まる値はビルド時に埋め込まれるので、これも変更として見る */
const ENV_FILES = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
];
/** OS が勝手に作るファイル(変更として扱わない) */
const IGNORED_NAMES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

const INSTALL_COMMAND = "npm install --no-save --include=dev --no-audit --no-fund";
/** next の本体。npm を通さず直接動かす(Windows で npm.cmd を挟むと、
 *  Ctrl+C のたびに「バッチ ジョブを終了しますか」が余計に出るため) */
const NEXT_BIN = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");

/** Ctrl+C が押されたら true */
let stopping = false;

// ---------------------------------------------------------------
// 表示
// ---------------------------------------------------------------

const heading = (index, title) => console.log(`\n[${index}/5] ${title}`);
const info = (message) => console.log(`  ${message}`);
const warn = (message) => console.log(`  ⚠ ${message}`);
// stderr に出すと、画面によっては stdout と順番が入れ替わるので stdout にそろえる
const fail = (message) => console.log(`  ✖ ${message}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function firstLine(text) {
  return String(text ?? "").trim().split(/\r?\n/)[0] ?? "";
}

function describeError(err) {
  if (!err) return "不明なエラー";
  // 接続拒否は AggregateError になり、code も message も中に入っていることがある
  const code = err.code ?? err.errors?.[0]?.code;
  const message = err.message || err.errors?.[0]?.message || "";
  return [code, message].filter(Boolean).join(" ") || String(err);
}

/** 全角を2文字ぶんとして右を空白で埋める(表示をそろえるため) */
function padDisplay(text, width) {
  let used = 0;
  for (const ch of text) used += ch.codePointAt(0) > 0xff ? 2 : 1;
  return text + " ".repeat(Math.max(1, width - used));
}

// ---------------------------------------------------------------
// 1. 更新の確認(git)
// ---------------------------------------------------------------

/** git を実行する。パスワード入力待ちで止まらないようにしておく */
function git(cwd, args, timeout = 30_000) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout,
    windowsHide: true,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0", // 認証が必要なら入力を求めずに失敗させる
      GCM_INTERACTIVE: "never", // Git Credential Manager の画面を出さない
    },
  });
}

/**
 * リモートの更新を取り込む(fast-forward のみ)。
 * どんな失敗でも例外は投げず、手元のコードのまま続けられるようにする。
 * @returns {{ status: "skip" | "ok" | "updated" | "warn", message: string }}
 */
export function updateFromGit(cwd) {
  const inside = git(cwd, ["rev-parse", "--is-inside-work-tree"]);
  if (inside.error?.code === "ENOENT") {
    return { status: "skip", message: "git が入っていないのでスキップしました" };
  }
  if (inside.status !== 0 || inside.stdout.trim() !== "true") {
    return {
      status: "skip",
      message: "git で管理されていないフォルダなのでスキップしました",
    };
  }

  const upstream = git(cwd, [
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{u}",
  ]);
  if (upstream.status !== 0) {
    return {
      status: "skip",
      message: "取り込み元のブランチが設定されていないのでスキップしました",
    };
  }
  const upstreamName = upstream.stdout.trim();

  const fetched = git(cwd, ["fetch", "--quiet"], 60_000);
  if (fetched.error || fetched.status !== 0) {
    const reason =
      fetched.error?.code === "ETIMEDOUT"
        ? "時間切れ"
        : firstLine(fetched.stderr) || describeError(fetched.error);
    return {
      status: "warn",
      message: `${upstreamName} に接続できませんでした (${reason})。手元のコードのまま起動します`,
    };
  }

  const before = git(cwd, ["rev-parse", "--short", "HEAD"]).stdout.trim();
  const counts = git(cwd, ["rev-list", "--left-right", "--count", "HEAD...@{u}"]);
  const [ahead, behind] = String(counts.stdout ?? "")
    .trim()
    .split(/\s+/)
    .map(Number);
  if (counts.status !== 0 || !Number.isInteger(ahead) || !Number.isInteger(behind)) {
    return {
      status: "warn",
      message: "更新があるか確認できませんでした。手元のコードのまま起動します",
    };
  }
  if (behind === 0) {
    return { status: "ok", message: `最新です (${before})` };
  }
  if (ahead > 0) {
    return {
      status: "warn",
      message:
        `このPCにしかないコミットが ${ahead} 件あるため、${behind} 件の更新を自動では取り込めません。` +
        "手元のコードのまま起動します (git pull で手動で取り込んでください)",
    };
  }

  const merged = git(cwd, ["merge", "--ff-only", "--quiet", "@{u}"], 60_000);
  if (merged.status !== 0) {
    return {
      status: "warn",
      message:
        `更新を取り込めませんでした (${firstLine(merged.stderr) || "不明なエラー"})。` +
        "このPCで直接書き換えたファイルとぶつかっている可能性があります。手元のコードのまま起動します",
    };
  }
  const after = git(cwd, ["rev-parse", "--short", "HEAD"]).stdout.trim();
  return {
    status: "updated",
    message: `${behind} 件の更新を取り込みました (${before} → ${after})`,
  };
}

// ---------------------------------------------------------------
// 2. 依存パッケージ
// ---------------------------------------------------------------

/**
 * node_modules が package-lock.json どおりになっているか。
 * npm がインストールのたびに書く node_modules/.package-lock.json と突き合わせる。
 * @returns {{ inSync: boolean, reason?: string }}
 */
export function dependencyStatus(cwd) {
  const lockPath = path.join(cwd, "package-lock.json");
  const installedPath = path.join(cwd, "node_modules", ".package-lock.json");

  if (!fs.existsSync(path.join(cwd, "node_modules"))) {
    return { inSync: false, reason: "まだインストールされていません" };
  }
  if (!fs.existsSync(lockPath)) {
    // 比べる基準がないので、入っているものをそのまま使う
    return { inSync: true };
  }
  if (!fs.existsSync(installedPath)) {
    return { inSync: false, reason: "インストールの記録がありません" };
  }

  let lock;
  let installed;
  try {
    lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    installed = JSON.parse(fs.readFileSync(installedPath, "utf8"));
  } catch {
    return { inSync: false, reason: "インストールの記録を読めませんでした" };
  }

  const have = installed.packages ?? {};
  for (const [key, meta] of Object.entries(lock.packages ?? {})) {
    // "" はこのプロジェクト自身。同梱パッケージ(inBundle)は親と一緒に入る
    if (!key || meta.link || meta.inBundle) continue;
    const got = have[key];
    if (!got) {
      // optional は別の OS 向けだったり、optional なものからしか使われていなかったりで、
      // 入っていなくて正常なことが多い(npm も入らなくてもエラーにしない)。
      // バージョンが変わったときは、入っている方の比較で気づける。
      if (meta.optional || meta.devOptional) continue;
      return {
        inSync: false,
        reason: `${key.replace(/^node_modules\//, "")} が入っていません`,
      };
    }
    if (meta.version && got.version !== meta.version) {
      return {
        inSync: false,
        reason: `${key.replace(/^node_modules\//, "")} のバージョンが変わっています (${got.version} → ${meta.version})`,
      };
    }
  }
  return { inSync: true };
}

/** 子プロセスの終了を待って終了コードを返す(出力はそのまま画面に出す) */
function waitForExit(child) {
  return new Promise((resolve) => {
    child.on("error", (err) => {
      fail(`実行できませんでした (${describeError(err)})`);
      resolve(1);
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

/** シェル経由でコマンドを実行する(固定の文字列だけを渡す。npm.cmd を動かすため) */
function runShellCommand(command) {
  return waitForExit(
    spawn(command, { cwd: projectRoot, shell: true, stdio: "inherit" })
  );
}

/** next を直接実行する */
function spawnNext(args) {
  return spawn(process.execPath, [NEXT_BIN, ...args], {
    cwd: projectRoot,
    stdio: "inherit",
  });
}

/**
 * package.json の build スクリプトを実行する。
 * "next build …" の形なら next を直接動かし、それ以外なら npm run build に任せる。
 */
function runBuild() {
  let script = "";
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")
    );
    script = String(pkg.scripts?.build ?? "").trim();
  } catch {
    /* 読めなければ npm に任せる */
  }
  const match = /^next\s+(build(?:\s+[\w-]+)*)$/.exec(script);
  if (match && fs.existsSync(NEXT_BIN)) {
    console.log(`  > ${script}`);
    return waitForExit(spawnNext(match[1].split(/\s+/)));
  }
  return runShellCommand("npm run build");
}

// ---------------------------------------------------------------
// 3. ビルド
// ---------------------------------------------------------------

function listFiles(cwd, relDir, out) {
  const absDir = path.join(cwd, ...relDir.split("/"));
  if (!fs.existsSync(absDir)) return;
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    if (IGNORED_NAMES.has(entry.name)) continue;
    const rel = `${relDir}/${entry.name}`;
    if (entry.isDirectory()) listFiles(cwd, rel, out);
    else if (entry.isFile()) out.push(rel);
  }
}

/** ビルドに影響するファイルの中身から、指紋(ハッシュ)を作る */
export function sourceFingerprint(cwd) {
  const files = [];
  for (const dir of SOURCE_DIRS) listFiles(cwd, dir, files);
  for (const file of SOURCE_FILES) {
    if (fs.existsSync(path.join(cwd, file))) files.push(file);
  }
  files.sort();

  const hash = createHash("sha256");
  hash.update(`node ${process.version}\0`);
  for (const rel of files) {
    hash.update(`${rel}\0`);
    hash.update(fs.readFileSync(path.join(cwd, ...rel.split("/"))));
    hash.update("\0");
  }
  for (const file of ENV_FILES) {
    const absPath = path.join(cwd, file);
    if (!fs.existsSync(absPath)) continue;
    const publicLines = fs
      .readFileSync(absPath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("NEXT_PUBLIC_"));
    hash.update(`${file}\0${publicLines.join("\n")}\0`);
  }
  return hash.digest("hex");
}

function hasProductionBuild() {
  const buildIdPath = path.join(DIST_DIR, "BUILD_ID");
  return (
    fs.existsSync(buildIdPath) &&
    fs.readFileSync(buildIdPath, "utf8").trim() !== "development"
  );
}

function readStamp() {
  try {
    return JSON.parse(fs.readFileSync(STAMP_FILE, "utf8"));
  } catch {
    return null;
  }
}

function writeStamp(fingerprint) {
  const commit = git(projectRoot, ["rev-parse", "--short", "HEAD"]);
  fs.writeFileSync(
    STAMP_FILE,
    JSON.stringify(
      {
        fingerprint,
        builtAt: new Date().toISOString(),
        commit: commit.status === 0 ? commit.stdout.trim() : null,
        node: process.version,
      },
      null,
      2
    )
  );
}

function describeStamp(stamp) {
  const when = new Date(stamp.builtAt).toLocaleString("ja-JP");
  return stamp.commit ? `${when} / ${stamp.commit}` : when;
}

function removeTree(target) {
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

function renameWithRetry(from, to) {
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (err) {
      // Windows ではウイルス対策ソフトなどが一瞬ファイルを掴んでいることがある
      if (attempt >= 5 || !["EPERM", "EBUSY", "EACCES"].includes(err.code)) {
        throw err;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
    }
  }
}

/** .next のうち、ビルドで作られるもの(cache / dev などは除く) */
function buildEntries() {
  return fs.existsSync(DIST_DIR)
    ? fs.readdirSync(DIST_DIR).filter((name) => !KEEP_IN_DIST.test(name))
    : [];
}

/** 前回のビルドを退避する。退避できたら true */
function backupPreviousBuild() {
  removeTree(BACKUP_DIR);
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const moved = [];
  try {
    for (const name of buildEntries()) {
      renameWithRetry(path.join(DIST_DIR, name), path.join(BACKUP_DIR, name));
      moved.push(name);
    }
    return true;
  } catch (err) {
    // 途中で失敗したら元に戻し、退避なしでビルドする
    for (const name of moved) {
      try {
        renameWithRetry(path.join(BACKUP_DIR, name), path.join(DIST_DIR, name));
      } catch {
        /* 戻せなかったものは次のビルドで作り直される */
      }
    }
    removeTree(BACKUP_DIR);
    warn(
      `前回のビルドを退避できませんでした (${describeError(err)})。失敗しても戻せない状態でビルドします`
    );
    return false;
  }
}

/** 退避しておいた前回のビルドに戻す。戻せたら true */
function restorePreviousBuild() {
  try {
    for (const name of buildEntries()) removeTree(path.join(DIST_DIR, name));
    for (const name of fs.readdirSync(BACKUP_DIR)) {
      renameWithRetry(path.join(BACKUP_DIR, name), path.join(DIST_DIR, name));
    }
    removeTree(BACKUP_DIR);
    return hasProductionBuild();
  } catch (err) {
    fail(`前回のビルドに戻せませんでした (${describeError(err)})`);
    return false;
  }
}

/** 必要ならビルドする。起動できる状態になっていれば true */
async function buildIfNeeded(force) {
  // 前回ビルドの途中でウィンドウが閉じられた、などで退避が残っていたら後片付けする。
  // 記録(STAMP_FILE)はビルドが最後まで成功したときだけ書くので、
  // 記録がないビルドは途中までのものとみなして、退避しておいた方に戻す。
  if (fs.existsSync(BACKUP_DIR)) {
    const currentIsComplete = hasProductionBuild() && readStamp() !== null;
    if (!currentIsComplete && fs.existsSync(path.join(BACKUP_DIR, "BUILD_ID"))) {
      if (restorePreviousBuild()) {
        warn("前回ビルドの途中で止まっていたので、その前のビルドに戻しました");
      }
    } else {
      removeTree(BACKUP_DIR);
    }
  }

  const fingerprint = sourceFingerprint(projectRoot);
  const stamp = readStamp();
  const hasBuild = hasProductionBuild();
  const reason = force
    ? "--rebuild が指定されました"
    : !hasBuild
      ? "まだビルドされていません"
      : !stamp
        ? "ビルドの記録がありません"
        : stamp.fingerprint !== fingerprint
          ? "前回のビルドからソースが変わっています"
          : null;

  if (!reason) {
    info(`変更なし (前回のビルド: ${describeStamp(stamp)})`);
    return true;
  }

  info(`${reason}。ビルドします…`);
  const backedUp = hasBuild && backupPreviousBuild();
  const startedAt = Date.now();
  const code = await runBuild();

  if (stopping) {
    if (backedUp) restorePreviousBuild();
    return false;
  }

  if (code === 0 && hasProductionBuild()) {
    // ビルドが tsconfig.json などを書き換えることがあるので、ビルド後の状態で記録する
    writeStamp(sourceFingerprint(projectRoot));
    if (backedUp) removeTree(BACKUP_DIR);
    info(`✔ ビルドしました (${Math.round((Date.now() - startedAt) / 1000)}秒)`);
    return true;
  }

  if (backedUp && restorePreviousBuild()) {
    warn("ビルドに失敗しました。前回のビルドのまま起動します");
    warn("上のエラーを直してから、もう一度起動するとビルドし直します");
    return true;
  }
  fail("ビルドに失敗しました。上のエラーを確認してください");
  return false;
}

// ---------------------------------------------------------------
// 4. データベース
// ---------------------------------------------------------------

/** PostgreSQL がまだ起動中などで、待てば繋がりそうなエラー */
const RETRYABLE_DB_ERRORS = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
  "57P03", // cannot_connect_now (起動処理中)
]);

function isRetryableDbError(err) {
  // IPv4/IPv6 の両方を試して失敗すると AggregateError になり、code が中に入っている
  const code = err?.code ?? err?.errors?.[0]?.code;
  return (
    RETRYABLE_DB_ERRORS.has(code) ||
    /timeout|Connection terminated/i.test(err?.message ?? "")
  );
}

async function prepareDatabase() {
  const MAX_ATTEMPTS = 7;
  const WAIT_MS = 5000;
  for (let attempt = 1; ; attempt++) {
    try {
      // 本番の起動のたびに流すので、「すでに存在します」などの通知は出さない
      return { ok: true, info: await applySchema(process.env.DATABASE_URL) };
    } catch (err) {
      if (stopping || attempt >= MAX_ATTEMPTS || !isRetryableDbError(err)) {
        return { ok: false, err };
      }
      warn(
        `接続できません (${describeError(err)})。${WAIT_MS / 1000}秒後にもう一度試します (${attempt}/${MAX_ATTEMPTS - 1})`
      );
      await sleep(WAIT_MS);
    }
  }
}

// ---------------------------------------------------------------
// 5. 起動
// ---------------------------------------------------------------

/** ポートが空いているか。空いていれば null、使えなければエラーコード */
function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", (err) => resolve(err.code ?? "ERROR"));
    server.listen({ port }, () => server.close(() => resolve(null)));
  });
}

function isTailscaleAddress(address) {
  const [a, b] = address.split(".").map(Number);
  return a === 100 && b >= 64 && b <= 127; // 100.64.0.0/10
}

/** ほかの端末から開くときのアドレス一覧 */
function accessUrls(port) {
  const rows = [["このPC", `http://localhost:${port}`]];
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    // 仮想アダプター(WSL など)は、ほかの端末からは届かないので出さない
    if (/loopback|vethernet|wsl|hyper-v|virtualbox|vmware|docker/i.test(name)) {
      continue;
    }
    for (const address of addresses ?? []) {
      const isIPv4 = address.family === "IPv4" || address.family === 4;
      if (!isIPv4 || address.internal || address.address.startsWith("169.254.")) {
        continue;
      }
      const label =
        isTailscaleAddress(address.address) || /tailscale/i.test(name)
          ? "Tailscale"
          : name;
      rows.push([label, `http://${address.address}:${port}`]);
    }
  }
  return rows;
}

function printAccessUrls(port) {
  console.log("");
  console.log("  ✔ サーバーが起動しました。次のアドレスで開けます:");
  for (const [label, url] of accessUrls(port)) {
    console.log(`      ${padDisplay(label, 14)}${url}`);
  }
  console.log("  止めるときは、このウィンドウで Ctrl+C を押してください。");
  console.log("");
}

function startServer(port) {
  return new Promise((resolve) => {
    const child = spawnNext(["start", "-p", String(port)]);

    // 応答が返るようになったら、開くアドレスを案内する
    const startedAt = Date.now();
    let checking = false;
    const timer = setInterval(async () => {
      if (checking) return;
      if (Date.now() - startedAt > 120_000) {
        clearInterval(timer);
        warn("起動に時間がかかっています。上のメッセージを確認してください");
        return;
      }
      checking = true;
      try {
        await fetch(`http://127.0.0.1:${port}/`, {
          signal: AbortSignal.timeout(3000),
        });
        clearInterval(timer);
        printAccessUrls(port);
      } catch {
        /* まだ起動していない */
      } finally {
        checking = false;
      }
    }, 1000);

    child.on("error", (err) => {
      clearInterval(timer);
      fail(`サーバーを起動できませんでした (${describeError(err)})`);
      resolve(1);
    });
    child.on("exit", (code) => {
      clearInterval(timer);
      resolve(stopping ? 0 : (code ?? 1));
    });
  });
}

// ---------------------------------------------------------------
// main
// ---------------------------------------------------------------

async function main() {
  // Ctrl+C はサーバーなどの子プロセスにも届く。こちらは後片付けしてから終わる
  process.on("SIGINT", () => {
    if (stopping) return;
    stopping = true;
    console.log("\n止めています…");
  });

  const args = new Set(process.argv.slice(2));
  loadEnvFiles();
  const noPull = args.has("--no-pull") || process.env.AUTO_PULL === "0";
  const forceRebuild = args.has("--rebuild");
  const port = Number(process.env.PORT ?? 3000);

  console.log("━━━ 屋台オーダー 本番サーバー ━━━");

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail(`PORT の値が不正です: ${process.env.PORT}`);
    return 1;
  }
  if (!process.env.DATABASE_URL) {
    fail("DATABASE_URL が設定されていません。.env.local を用意してください (.env.local.example を参考に)");
    return 1;
  }
  const portError = await checkPort(port);
  if (portError === "EADDRINUSE") {
    fail(`ポート ${port} はすでに使われています。サーバーがもう起動していないか確認してください`);
    info("別のポートで起動するなら、.env.local に PORT=3001 のように書いてください");
    return 1;
  }
  if (portError) {
    fail(`ポート ${port} を使えません (${portError})`);
    return 1;
  }

  heading(1, "更新の確認");
  if (noPull) {
    info("スキップしました (--no-pull)");
  } else {
    const result = updateFromGit(projectRoot);
    (result.status === "warn" ? warn : info)(result.message);
  }
  if (stopping) return 0;

  heading(2, "依存パッケージ");
  const deps = dependencyStatus(projectRoot);
  if (deps.inSync) {
    info("変更なし");
  } else {
    info(`${deps.reason}。インストールします…`);
    const code = await runShellCommand(INSTALL_COMMAND);
    if (stopping) return 0;
    if (code !== 0) {
      if (!fs.existsSync(path.join(projectRoot, "node_modules", "next"))) {
        fail("インストールに失敗しました。インターネットに繋がっているか確認してください");
        return 1;
      }
      warn("インストールに失敗しました。いま入っているパッケージのまま続けます");
    }
  }

  heading(3, "ビルド");
  const ready = await buildIfNeeded(forceRebuild);
  if (stopping) return 0;
  if (!ready) return 1;

  heading(4, "データベース");
  const db = await prepareDatabase();
  if (stopping) return 0;
  if (db.ok) {
    info(`OK: ${db.info.db} (${db.info.version})`);
  } else {
    warn(`データベースの準備に失敗しました: ${describeError(db.err)}`);
    warn("PostgreSQL が起動しているか、.env.local の DATABASE_URL が正しいか確認してください");
    warn("サーバーは起動しますが、データベースに繋がるまで画面はエラーになります");
  }

  heading(5, "起動");
  return startServer(port);
}

/** このファイルが直接実行されたか(テストから import したときは main を動かさない) */
function isMainModule() {
  if (!process.argv[1]) return false;
  const self = fileURLToPath(import.meta.url);
  const entry = path.resolve(process.argv[1]);
  return process.platform === "win32"
    ? self.toLowerCase() === entry.toLowerCase()
    : self === entry;
}

if (isMainModule()) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(err);
      process.exit(1);
    }
  );
}
