import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 親フォルダに別の lockfile があってもこのフォルダを基準にする
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
