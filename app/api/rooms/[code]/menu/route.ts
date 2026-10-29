import { NextResponse } from "next/server";
import {
  createMenuItem,
  listMenuItems,
  listOptionNodesByRoom,
  reorderMenuItems,
} from "@/lib/repo";
import {
  isUuid,
  jsonError,
  optionalInt,
  optionalText,
  readJsonBody,
  roomRoute,
} from "@/lib/http";
import { MAX_PREP_MINUTES } from "@/lib/wait";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * メニュー一覧を取得する。
 *   ?activeOnly=1   販売中(is_active)のみ
 *   ?withOptions=1  部屋のオプションノードも一緒に返す(レジ画面用)
 */
export const GET = roomRoute<{ code: string }>(async ({ req, room }) => {
  const url = new URL(req.url);
  const activeOnly = url.searchParams.get("activeOnly") === "1";
  const withOptions = url.searchParams.get("withOptions") === "1";

  const [items, optionNodes] = await Promise.all([
    listMenuItems(room.id, { activeOnly }),
    withOptions ? listOptionNodesByRoom(room.id) : Promise.resolve(undefined),
  ]);

  return NextResponse.json(
    withOptions ? { items, optionNodes } : { items }
  );
});

/** 商品を追加する */
export const POST = roomRoute<{ code: string }>(async ({ req, room }) => {
  const body = await readJsonBody(req);
  if (!body) return jsonError("不正なリクエスト", 400);

  const name = optionalText(body.name, 100);
  if (!name) {
    return jsonError("商品名を1〜100文字で入力してください", 400);
  }
  const price = optionalInt(body.price, { max: 10_000_000 });
  if (price === undefined) {
    return jsonError("価格は0以上の整数で入力してください", 400);
  }
  // 未指定なら0分(待ち時間に加算しない)
  const prepMinutes =
    body.prep_minutes === undefined || body.prep_minutes === null
      ? 0
      : optionalInt(body.prep_minutes, { max: MAX_PREP_MINUTES });
  if (prepMinutes === undefined) {
    return jsonError(
      `製作時間は0〜${MAX_PREP_MINUTES}分の整数で入力してください`,
      400
    );
  }

  const item = await createMenuItem(room.id, {
    name,
    price,
    prep_minutes: prepMinutes,
  });
  return NextResponse.json({ item }, { status: 201 });
});

/** 並び替え: 渡された ID の順に sort_order を振り直す */
export const PATCH = roomRoute<{ code: string }>(async ({ req, room }) => {
  const body = await readJsonBody(req);
  const itemIds = body?.itemIds;
  if (
    !Array.isArray(itemIds) ||
    itemIds.length === 0 ||
    itemIds.length > 500 ||
    !itemIds.every(isUuid)
  ) {
    return jsonError("並び順の指定が不正です", 400);
  }

  const updated = await reorderMenuItems(room.id, itemIds as string[]);
  return NextResponse.json({ updated });
});
