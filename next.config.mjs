import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 開発サーバー(npm run dev)を、スマホなど別の端末から使えるようにする。
 *
 * Next.js は開発中、localhost 以外のアドレスで開いたページからの
 * HMR 接続(/_next/webpack-hmr)をブロックする。Next 16 は開発時に
 * この接続を画面の初期化(水和)にも使うため、ブロックされると
 * 画面は表示されてもボタンが一切反応しなくなる。
 *
 * このPC自身のアドレス(Wi-Fi / Tailscale など)とコンピューター名だけを許可する。
 * 起動時点のアドレスを使うので、Wi-Fi を変えたら dev サーバーを再起動すること。
 * 本番(npm start)にはこの制限がないので影響しない。
 */
function localDevOrigins() {
  const hosts = new Set();
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" || address.family === 4) {
        hosts.add(address.address);
      }
    }
  }
  const computerName = os.hostname().toLowerCase();
  hosts.add(computerName); // Tailscale の MagicDNS 名など
  hosts.add(`${computerName}.local`); // mDNS
  return [...hosts];
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 親フォルダに別の lockfile があってもこのフォルダを基準にする
  outputFileTracingRoot: __dirname,
  allowedDevOrigins: localDevOrigins(),
};

export default nextConfig;
