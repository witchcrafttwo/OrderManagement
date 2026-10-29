import { NextResponse } from "next/server";
import { updateOrderStatus } from "@/lib/repo";
import { isUuid, jsonError, readJsonBody, roomRoute } from "@/lib/http";
import type { OrderStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { code: string; orderId: string };

const STATUSES: OrderStatus[] = ["pending", "preparing", "done"];

/** 注文の状態を更新する(done にしたときは completed_at をサーバー時刻で入れる) */
export const PATCH = roomRoute<Params>(async ({ req, room, params }) => {
  if (!isUuid(params.orderId)) return jsonError("注文IDが不正です", 400);

  const body = await readJsonBody(req);
  const status = body?.status;
  if (!STATUSES.includes(status as OrderStatus)) {
    return jsonError("状態は pending / preparing / done のいずれかです", 400);
  }

  const order = await updateOrderStatus(
    room.id,
    params.orderId,
    status as OrderStatus
  );
  if (!order) return jsonError("注文が見つかりません", 404);

  return NextResponse.json({ order });
});
