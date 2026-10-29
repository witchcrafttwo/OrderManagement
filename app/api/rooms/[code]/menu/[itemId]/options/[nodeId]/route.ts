import { NextResponse } from "next/server";
import { deleteOptionNode, updateOptionNode } from "@/lib/repo";
import {
  isUuid,
  jsonError,
  optionalBool,
  optionalInt,
  optionalText,
  readJsonBody,
  roomRoute,
} from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { code: string; itemId: string; nodeId: string };

/** ラベル / 追加料金 / 「なし」を選べるか を更新する */
export const PATCH = roomRoute<Params>(async ({ req, room, params }) => {
  if (!isUuid(params.nodeId)) return jsonError("ノードIDが不正です", 400);

  const body = await readJsonBody(req);
  if (!body) return jsonError("不正なリクエスト", 400);

  const patch: {
    label?: string;
    price_delta?: number;
    optional?: boolean;
  } = {};

  if ("label" in body) {
    const label = optionalText(body.label, 100);
    if (!label) return jsonError("名前を1〜100文字で入力してください", 400);
    patch.label = label;
  }
  if ("price_delta" in body) {
    const priceDelta = optionalInt(body.price_delta, {
      min: -10_000_000,
      max: 10_000_000,
    });
    if (priceDelta === undefined) {
      return jsonError("追加料金は整数で入力してください", 400);
    }
    patch.price_delta = priceDelta;
  }
  if ("optional" in body) {
    const optional = optionalBool(body.optional);
    if (optional === undefined) {
      return jsonError("「なし」の指定が不正です", 400);
    }
    patch.optional = optional;
  }
  if (Object.keys(patch).length === 0) {
    return jsonError("更新する項目がありません", 400);
  }

  const node = await updateOptionNode(room.id, params.nodeId, patch);
  if (!node) return jsonError("オプションが見つかりません", 404);

  return NextResponse.json({ node });
});

/** オプションノードを削除する(子ノードも cascade で消える) */
export const DELETE = roomRoute<Params>(async ({ room, params }) => {
  if (!isUuid(params.nodeId)) return jsonError("ノードIDが不正です", 400);

  const deleted = await deleteOptionNode(room.id, params.nodeId);
  if (!deleted) return jsonError("オプションが見つかりません", 404);

  return NextResponse.json({ ok: true });
});
