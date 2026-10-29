import { NextResponse } from "next/server";
import {
  deleteMenuItem,
  findMenuItem,
  listOptionNodesByItem,
  updateMenuItem,
} from "@/lib/repo";
import {
  jsonError,
  optionalBool,
  optionalInt,
  optionalText,
  readJsonBody,
  roomRoute,
} from "@/lib/http";
import { MAX_PREP_MINUTES } from "@/lib/wait";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { code: string; itemId: string };

/** 商品1件とそのオプションツリーを取得する(オプション編集画面用) */
export const GET = roomRoute<Params>(async ({ room, params }) => {
  const [item, optionNodes] = await Promise.all([
    findMenuItem(room.id, params.itemId),
    listOptionNodesByItem(room.id, params.itemId),
  ]);
  if (!item) return jsonError("商品が見つかりません", 404);

  return NextResponse.json({ item, optionNodes });
});

/** 商品名 / 価格 / 販売状態を更新する(渡された項目だけ) */
export const PATCH = roomRoute<Params>(async ({ req, room, params }) => {
  const body = await readJsonBody(req);
  if (!body) return jsonError("不正なリクエスト", 400);

  const patch: {
    name?: string;
    price?: number;
    prep_minutes?: number;
    is_active?: boolean;
  } = {};
  if ("name" in body) {
    const name = optionalText(body.name, 100);
    if (!name) return jsonError("商品名を1〜100文字で入力してください", 400);
    patch.name = name;
  }
  if ("price" in body) {
    const price = optionalInt(body.price, { max: 10_000_000 });
    if (price === undefined) {
      return jsonError("価格は0以上の整数で入力してください", 400);
    }
    patch.price = price;
  }
  if ("prep_minutes" in body) {
    const prepMinutes = optionalInt(body.prep_minutes, {
      max: MAX_PREP_MINUTES,
    });
    if (prepMinutes === undefined) {
      return jsonError(
        `製作時間は0〜${MAX_PREP_MINUTES}分の整数で入力してください`,
        400
      );
    }
    patch.prep_minutes = prepMinutes;
  }
  if ("is_active" in body) {
    const isActive = optionalBool(body.is_active);
    if (isActive === undefined) {
      return jsonError("販売状態の指定が不正です", 400);
    }
    patch.is_active = isActive;
  }
  if (Object.keys(patch).length === 0) {
    return jsonError("更新する項目がありません", 400);
  }

  const item = await updateMenuItem(room.id, params.itemId, patch);
  if (!item) return jsonError("商品が見つかりません", 404);

  return NextResponse.json({ item });
});

/** 商品を削除する(オプションも cascade で消える) */
export const DELETE = roomRoute<Params>(async ({ room, params }) => {
  const deleted = await deleteMenuItem(room.id, params.itemId);
  if (!deleted) return jsonError("商品が見つかりません", 404);

  return NextResponse.json({ ok: true });
});
