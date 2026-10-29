import { NextResponse } from "next/server";
import { getWaitBoard } from "@/lib/repo";
import { roomRoute } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 待ち時間ボード用のデータ。
 *   queue … 未完成の注文(古い順・製作時間つき)
 *   ready … できあがって呼び出し中の注文(新しい順)
 *
 * 待ち時間そのものはブラウザ側(lib/wait.ts)で計算する。
 * そうすれば、再取得しなくても表示が1分ごとに減っていく。
 */
export const GET = roomRoute<{ code: string }>(async ({ room }) => {
  const board = await getWaitBoard(room.id);
  return NextResponse.json(board);
});
