import { NextResponse } from "next/server";
import { deleteRoomById, normalizeRoomCode } from "@/lib/repo";
import { jsonError, readJsonBody, roomRoute } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 部屋コードから部屋情報を取得する */
export const GET = roomRoute<{ code: string }>(async ({ room }) => {
  return NextResponse.json({ room });
});

/**
 * 部屋を完全に削除する(メニュー・注文も cascade で消える)。
 * 誤操作防止のため、ボディに部屋コードの再入力を求める。
 */
export const DELETE = roomRoute<{ code: string }>(async ({ req, room }) => {
  const body = await readJsonBody(req);
  const confirmCode = body?.confirmCode;
  if (
    typeof confirmCode !== "string" ||
    normalizeRoomCode(confirmCode) !== room.code
  ) {
    return jsonError("部屋コードが一致しないため中止しました", 400);
  }

  const deleted = await deleteRoomById(room.id);
  if (!deleted) return jsonError("部屋の削除に失敗しました", 500);

  return NextResponse.json({ ok: true });
});
