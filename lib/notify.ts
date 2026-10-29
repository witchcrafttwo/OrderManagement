import { Client } from "pg";
import { connectionConfig } from "@/lib/db";
import type { RoomChange } from "@/lib/types";

/**
 * Supabase Realtime の置き換え。
 *
 * PostgreSQL のトリガー(db/schema.sql の notify_room_change)が
 * 'room_changes' チャンネルに NOTIFY してくるので、
 * 専用の接続で LISTEN し、部屋ごとの購読者に配る。
 * ブラウザへは SSE(app/api/rooms/[code]/stream)で中継する。
 */

const CHANNEL = "room_changes";

type Subscriber = (change: RoomChange) => void;

class RoomChangeHub {
  private client: Client | null = null;
  private starting: Promise<void> | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private retryDelayMs = 1000;
  private subscribers = new Map<string, Set<Subscriber>>();

  /** 部屋の変更通知を購読する。戻り値を呼ぶと解除される。 */
  subscribe(roomId: string, onChange: Subscriber): () => void {
    let set = this.subscribers.get(roomId);
    if (!set) {
      set = new Set();
      this.subscribers.set(roomId, set);
    }
    set.add(onChange);

    void this.ensureConnected();

    return () => {
      const current = this.subscribers.get(roomId);
      if (!current) return;
      current.delete(onChange);
      if (current.size === 0) this.subscribers.delete(roomId);
    };
  }

  private ensureConnected(): Promise<void> {
    if (this.client) return Promise.resolve();
    if (this.starting) return this.starting;

    this.starting = this.connect()
      .catch((err: unknown) => {
        console.error(
          "[notify] LISTEN 接続に失敗しました:",
          err instanceof Error ? err.message : err
        );
        this.scheduleReconnect();
      })
      .finally(() => {
        this.starting = null;
      });

    return this.starting;
  }

  private async connect(): Promise<void> {
    const client = new Client(
      connectionConfig("stall-order-manager-listener")
    );

    client.on("notification", (message) => {
      this.dispatch(message.payload);
    });
    client.on("error", (err: Error) => {
      console.error("[notify] LISTEN 接続でエラー:", err.message);
      this.handleDisconnect(client);
    });
    client.on("end", () => {
      this.handleDisconnect(client);
    });

    await client.connect();
    // CHANNEL は固定の定数なので識別子の埋め込みは安全
    await client.query(`LISTEN ${CHANNEL}`);

    this.client = client;
    const isReconnect = this.retryDelayMs > 1000;
    this.retryDelayMs = 1000;

    // 切断中に取りこぼした変更があるので、購読中の全部屋に再取得を促す
    if (isReconnect) this.broadcastResync();
  }

  private handleDisconnect(client: Client): void {
    if (this.client !== client) return;
    this.client = null;
    void client.end().catch(() => {});
    if (this.subscribers.size > 0) this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = this.retryDelayMs;
    this.retryDelayMs = Math.min(delay * 2, 30_000);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.subscribers.size === 0) return;
      void this.ensureConnected();
    }, delay);
    this.reconnectTimer.unref?.();
  }

  private dispatch(payload: string | undefined): void {
    if (!payload) return;
    let change: RoomChange;
    try {
      change = JSON.parse(payload) as RoomChange;
    } catch {
      console.error("[notify] 通知の JSON を解析できませんでした:", payload);
      return;
    }
    if (!change?.room_id) return;

    for (const subscriber of this.subscribers.get(change.room_id) ?? []) {
      try {
        subscriber(change);
      } catch (err) {
        console.error("[notify] 購読者の処理でエラー:", err);
      }
    }
  }

  private broadcastResync(): void {
    for (const [roomId, set] of this.subscribers) {
      for (const subscriber of set) {
        try {
          subscriber({ room_id: roomId, table: "all", event: "RESYNC" });
        } catch {
          /* 個々の購読者のエラーは無視 */
        }
      }
    }
  }
}

const globalForNotify = globalThis as typeof globalThis & {
  __roomChangeHub?: RoomChangeHub;
};

function getHub(): RoomChangeHub {
  if (!globalForNotify.__roomChangeHub) {
    globalForNotify.__roomChangeHub = new RoomChangeHub();
  }
  return globalForNotify.__roomChangeHub;
}

/** 部屋の変更通知を購読する(戻り値を呼ぶと解除) */
export function subscribeRoomChanges(
  roomId: string,
  onChange: Subscriber
): () => void {
  return getHub().subscribe(roomId, onChange);
}
