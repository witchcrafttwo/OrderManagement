import { findRoomByCode } from "@/lib/repo";
import { subscribeRoomChanges } from "@/lib/notify";
import { jsonError, serverError } from "@/lib/http";
import type { RoomChange } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const KEEP_ALIVE_MS = 25_000;

/**
 * 部屋の変更を Server-Sent Events で流す(Supabase Realtime の置き換え)。
 *
 * イベント:
 *   ready  … 接続確立
 *   change … {"room_id":"...","table":"orders","event":"INSERT"}
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ code: string }> }
): Promise<Response> {
  let room;
  try {
    const { code } = await ctx.params;
    room = await findRoomByCode(code);
  } catch (err) {
    return serverError(err);
  }
  if (!room) return jsonError("部屋が見つかりません", 404);

  const roomId = room.id;
  const encoder = new TextEncoder();

  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  let keepAlive: NodeJS.Timeout | null = null;
  let unsubscribe: (() => void) | null = null;
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (keepAlive) clearInterval(keepAlive);
    unsubscribe?.();
    try {
      controllerRef?.close();
    } catch {
      /* すでに閉じている場合は無視 */
    }
  };

  const write = (chunk: string) => {
    if (closed) return;
    try {
      controllerRef?.enqueue(encoder.encode(chunk));
    } catch {
      cleanup();
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;

      // 切断時にブラウザが再接続するまでの待ち時間
      write("retry: 3000\n\n");
      write(`event: ready\ndata: ${JSON.stringify({ room_id: roomId })}\n\n`);

      unsubscribe = subscribeRoomChanges(roomId, (change: RoomChange) => {
        write(`event: change\ndata: ${JSON.stringify(change)}\n\n`);
      });

      // プロキシに切られないようコメント行を定期送信
      keepAlive = setInterval(() => write(": ping\n\n"), KEEP_ALIVE_MS);
      keepAlive.unref?.();

      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // nginx などのリバースプロキシでバッファされないようにする
      "X-Accel-Buffering": "no",
    },
  });
}
