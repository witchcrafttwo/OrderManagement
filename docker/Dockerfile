# syntax=docker/dockerfile:1

# =============================================================
#  屋台オーダー  本番用 Docker イメージ
#
#  ふだんは同じフォルダの compose.yaml から使う(この docker フォルダの中で):
#    docker compose up -d --build
#  使い方と設定の説明は compose.yaml の先頭にある。
#
#  .env.local はイメージに入らない(Dockerfile.dockerignore で除外)。
#  パスワードなどは、起動するときに環境変数として渡す(compose.yaml の env_file)。
#
#  起動のたびに db/*.sql を適用してからサーバーを立ち上げる(何度流しても安全)。
#  DB に繋がらなければコンテナは止まり、restart の設定で自動的にやり直す。
# =============================================================

ARG NODE_VERSION=22

# ---------- 1. 依存パッケージ ----------
FROM node:${NODE_VERSION}-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include=dev --no-audit --no-fund

# ---------- 2. ビルド ----------
FROM node:${NODE_VERSION}-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    STANDALONE_OUTPUT=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# ---------- 3. 実行 ----------
FROM node:${NODE_VERSION}-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    RUNNING_IN_DOCKER=1

# サーバー本体(next build の standalone 出力)と、配信する静的ファイル
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

# 起動時のテーブル作成・更新(npm run db:setup と同じ処理)
COPY --from=builder --chown=node:node /app/db ./db
COPY --from=builder --chown=node:node \
     /app/scripts/db-setup.mjs /app/scripts/schema.mjs /app/scripts/env.mjs \
     ./scripts/

USER node
EXPOSE 3000

# exec で sh をサーバーに置き換え、docker stop の合図がサーバーに直接届くようにする
CMD ["sh", "-c", "node scripts/db-setup.mjs && exec node server.js"]
