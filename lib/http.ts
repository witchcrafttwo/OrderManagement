import { NextResponse } from "next/server";
import { findRoomByCode } from "@/lib/repo";
import type { Room } from "@/lib/types";

/** API Route 用の共通ヘルパー */

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** UUID 形式かどうか(不正な値で DB に問い合わせないためのガード) */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * 予期しないエラーを 500 に変換する。
 * 中身(SQL 文など)をブラウザに漏らさないよう、本番では固定文を返す。
 */
export function serverError(err: unknown): NextResponse {
  // 22P02 = invalid_text_representation (UUID などの形式違い)
  if (err && typeof err === "object" && (err as { code?: string }).code === "22P02") {
    return jsonError("IDの形式が不正です", 400);
  }

  console.error("[api]", err);
  const detail =
    process.env.NODE_ENV === "production"
      ? null
      : err instanceof Error
        ? err.message
        : String(err);
  return NextResponse.json(
    {
      error: detail
        ? `サーバーでエラーが発生しました: ${detail}`
        : "サーバーでエラーが発生しました",
    },
    { status: 500 }
  );
}

/**
 * 部屋コード付きルートのラッパー。
 *   - URL の code から部屋を解決する(見つからなければ 404)
 *   - 例外をまとめて 500 にする
 *
 * room_id をブラウザから受け取らず必ずサーバー側で引き直すので、
 * 他の部屋のデータを触られる心配がない。
 */
export function roomRoute<P extends { code: string }>(
  handler: (args: {
    req: Request;
    room: Room;
    params: P;
  }) => Promise<NextResponse | Response>
) {
  return async (
    req: Request,
    ctx: { params: Promise<P> }
  ): Promise<NextResponse | Response> => {
    try {
      const params = await ctx.params;
      const room = await findRoomByCode(params.code);
      if (!room) return jsonError("部屋が見つかりません", 404);
      return await handler({ req, room, params });
    } catch (err) {
      return serverError(err);
    }
  };
}

/** リクエストボディの JSON を読む(壊れていたら null) */
export async function readJsonBody(
  req: Request
): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return null;
    }
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** 空でない文字列として取り出す(それ以外は undefined) */
export function optionalText(
  value: unknown,
  maxLength = 200
): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return undefined;
  return trimmed;
}

/** 0 以上の整数として取り出す(それ以外は undefined) */
export function optionalInt(
  value: unknown,
  { min = 0, max = 100_000_000 }: { min?: number; max?: number } = {}
): number | undefined {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(num) || num < min || num > max) return undefined;
  return num;
}

/** 真偽値として取り出す(それ以外は undefined) */
export function optionalBool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
