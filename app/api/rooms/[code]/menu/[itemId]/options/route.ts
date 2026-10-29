import { NextResponse } from "next/server";
import { createOptionNode } from "@/lib/repo";
import {
  isUuid,
  jsonError,
  optionalInt,
  optionalText,
  readJsonBody,
  roomRoute,
} from "@/lib/http";
import type { OptionNodeType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { code: string; itemId: string };

const DEFAULT_LABEL: Record<OptionNodeType, string> = {
  group: "新しい質問",
  option: "新しい選択肢",
};

/**
 * オプションノード(質問グループ / 選択肢)を追加する。
 *   parent_id = null   … 商品直下の質問グループ
 *   parent_id = group  … その中の選択肢
 *   parent_id = option … 選択肢の下にさらに続く質問グループ
 */
export const POST = roomRoute<Params>(async ({ req, room, params }) => {
  if (!isUuid(params.itemId)) return jsonError("商品IDが不正です", 400);

  const body = await readJsonBody(req);
  if (!body) return jsonError("不正なリクエスト", 400);

  const nodeType = body.node_type;
  if (nodeType !== "group" && nodeType !== "option") {
    return jsonError("node_type は group か option を指定してください", 400);
  }

  const parentId = body.parent_id ?? null;
  if (parentId !== null && !isUuid(parentId)) {
    return jsonError("親ノードIDが不正です", 400);
  }

  const node = await createOptionNode(room.id, params.itemId, {
    parent_id: parentId,
    node_type: nodeType,
    label: optionalText(body.label, 100) ?? DEFAULT_LABEL[nodeType],
    sort_order: optionalInt(body.sort_order, { max: 10_000 }) ?? 0,
  });

  // 商品または親ノードがこの部屋のものでなければ 0 行
  if (!node) {
    return jsonError("商品または親ノードが見つかりません", 404);
  }

  return NextResponse.json({ node }, { status: 201 });
});
