import { NextResponse } from "next/server";
import {
  createOrder,
  deleteOrdersByRoom,
  listOrders,
  type NewOrderLine,
  type OrderFilter,
} from "@/lib/repo";
import { isUuid, jsonError, readJsonBody, roomRoute } from "@/lib/http";
import { MAX_PREP_MINUTES } from "@/lib/wait";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LINES = 200;
const MAX_QUANTITY = 999;
const MAX_PRICE = 10_000_000;
const MAX_NOTE_LENGTH = 1000;

/**
 * 注文一覧を取得する。
 *   ?filter=active (既定) 未完成を古い順   … 厨房
 *   ?filter=done          完成を新しい順   … 売上
 *   ?filter=all           全件を番号順     … CSV 書き出し
 */
export const GET = roomRoute<{ code: string }>(async ({ req, room }) => {
  const raw = new URL(req.url).searchParams.get("filter") ?? "active";
  if (raw !== "active" && raw !== "done" && raw !== "all") {
    return jsonError("filter は active / done / all のいずれかです", 400);
  }

  const orders = await listOrders(room.id, raw as OrderFilter);
  return NextResponse.json({ orders });
});

/** 注文を登録する(本体と明細を1トランザクションで作成) */
export const POST = roomRoute<{ code: string }>(async ({ req, room }) => {
  const body = await readJsonBody(req);
  if (!body) return jsonError("不正なリクエスト", 400);

  const rawLines = body.lines;
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    return jsonError("注文の内容が空です", 400);
  }
  if (rawLines.length > MAX_LINES) {
    return jsonError(`1回の注文は${MAX_LINES}品までです`, 400);
  }

  const lines: NewOrderLine[] = [];
  for (const raw of rawLines) {
    if (!raw || typeof raw !== "object") {
      return jsonError("注文明細の形式が不正です", 400);
    }
    const line = raw as Record<string, unknown>;

    const name = typeof line.name === "string" ? line.name.trim() : "";
    if (!name || name.length > 300) {
      return jsonError("商品名の指定が不正です", 400);
    }

    const price = Number(line.price);
    if (!Number.isInteger(price) || price < 0 || price > MAX_PRICE) {
      return jsonError(`「${name}」の価格が不正です`, 400);
    }

    const quantity = Number(line.quantity);
    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_QUANTITY
    ) {
      return jsonError(`「${name}」の数量が不正です`, 400);
    }

    // 製作時間。未指定なら0分として扱う(待ち時間に加算しない)
    const prepMinutes =
      line.prep_minutes === undefined || line.prep_minutes === null
        ? 0
        : Number(line.prep_minutes);
    if (
      !Number.isInteger(prepMinutes) ||
      prepMinutes < 0 ||
      prepMinutes > MAX_PREP_MINUTES
    ) {
      return jsonError(`「${name}」の製作時間が不正です`, 400);
    }

    const menuItemId = line.menu_item_id ?? null;
    if (menuItemId !== null && !isUuid(menuItemId)) {
      return jsonError(`「${name}」の商品IDが不正です`, 400);
    }

    lines.push({
      menu_item_id: menuItemId,
      name,
      price,
      prep_minutes: prepMinutes,
      quantity,
    });
  }

  const rawNote = typeof body.note === "string" ? body.note.trim() : "";
  if (rawNote.length > MAX_NOTE_LENGTH) {
    return jsonError(`備考は${MAX_NOTE_LENGTH}文字までです`, 400);
  }

  // 合計金額はクライアントの計算値を信用せず、明細から計算する
  const order = await createOrder(room.id, {
    note: rawNote || null,
    lines,
  });

  return NextResponse.json({ order }, { status: 201 });
});

/** 営業終了リセット: この部屋の注文をすべて削除する(明細も cascade) */
export const DELETE = roomRoute<{ code: string }>(async ({ room }) => {
  const deleted = await deleteOrdersByRoom(room.id);
  return NextResponse.json({ deleted });
});
