"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { useRoom } from "@/lib/useRoom";
import { RoomHeader } from "@/components/RoomHeader";
import { elapsed, yen } from "@/lib/format";
import type { OrderWithItems } from "@/lib/types";

// public/ に置いた通知音ファイルのパス(ファイル名は notify.mp3 にしてください)
const NOTIFY_SOUND_SRC = "/notify.mp3";

export default function KitchenPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const { room, loading, error } = useRoom(code);
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [, forceTick] = useState(0);

  // 通知音まわり
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const soundOnRef = useRef(false);

  // 保存済みの設定を復元
  useEffect(() => {
    setSoundOn(localStorage.getItem("kitchen_sound") === "on");
  }, []);
  // 最新の soundOn をリアルタイム購読コールバックから参照できるようにする
  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

  async function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    localStorage.setItem("kitchen_sound", next ? "on" : "off");
    // ユーザー操作のこのタイミングで一度再生し、自動再生制限を解除しておく
    if (next && audioRef.current) {
      try {
        await audioRef.current.play();
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch {
        /* 音源が未配置などの場合は無視 */
      }
    }
  }

  const load = useCallback(async (roomId: string) => {
    const { data } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("room_id", roomId)
      .neq("status", "done")
      .order("created_at", { ascending: true });
    setOrders((data as OrderWithItems[]) ?? []);
  }, []);

  // 初回ロード + リアルタイム購読
  useEffect(() => {
    if (!room) return;
    load(room.id);

    const channel = supabase
      .channel(`kitchen-${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `room_id=eq.${room.id}`,
        },
        () => load(room.id)
      )
      // 新規注文(INSERT)が入ったら通知音を鳴らす
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          filter: `room_id=eq.${room.id}`,
        },
        () => {
          if (soundOnRef.current && audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => {});
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        () => load(room.id)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room, load]);

  // 経過時間の表示を1分ごとに更新
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  async function setStatus(orderId: string, status: "preparing" | "done") {
    // 楽観的更新: 完成なら即座にリストから消す
    if (status === "done") {
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } else {
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status } : o))
      );
    }
    await supabase
      .from("orders")
      .update({
        status,
        completed_at: status === "done" ? new Date().toISOString() : null,
      })
      .eq("id", orderId);
  }

  if (loading) return <Center>読み込み中...</Center>;
  if (error || !room)
    return (
      <Center>
        <p className="mb-4 text-red-600">{error ?? "部屋が見つかりません"}</p>
        <Link href="/" className="font-bold text-brand underline">
          ホームに戻る
        </Link>
      </Center>
    );

  return (
    <div className="mx-auto max-w-5xl">
      <RoomHeader room={room} title={`厨房 (${orders.length}件)`} />

      {/* 通知音の音源(public/notify.mp3) */}
      <audio ref={audioRef} src={NOTIFY_SOUND_SRC} preload="auto" />

      <div className="flex justify-end px-4 pt-3">
        <button
          onClick={toggleSound}
          className={`rounded-full px-4 py-2 text-sm font-bold ${
            soundOn
              ? "bg-emerald-100 text-emerald-700"
              : "bg-slate-200 text-slate-500"
          }`}
        >
          {soundOn ? "🔔 通知音 ON" : "🔕 通知音 OFF"}
        </button>
      </div>

      <div className="p-4">
        {orders.length === 0 ? (
          <div className="rounded-xl bg-white p-10 text-center text-slate-400">
            <p className="text-4xl">🍳</p>
            <p className="mt-2">未完成の注文はありません</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {orders.map((order) => (
              <div
                key={order.id}
                className={`rounded-2xl bg-white p-4 shadow-sm ring-2 ${
                  order.status === "preparing"
                    ? "ring-amber-400"
                    : "ring-transparent"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">#{order.ticket_no}</span>
                  <span className="text-xs text-slate-400">
                    {elapsed(order.created_at)}
                  </span>
                </div>

                <ul className="my-3 space-y-1">
                  {order.order_items.map((it) => (
                    <li key={it.id} className="flex justify-between text-sm">
                      <span>{it.name}</span>
                      <span className="font-bold">×{it.quantity}</span>
                    </li>
                  ))}
                </ul>

                {order.note && (
                  <p className="mb-3 rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
                    📝 {order.note}
                  </p>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">
                    {yen(order.total)}
                  </span>
                  <div className="flex gap-2">
                    {order.status === "pending" && (
                      <button
                        onClick={() => setStatus(order.id, "preparing")}
                        className="rounded-lg bg-amber-100 px-4 py-2 text-sm font-bold text-amber-700 active:bg-amber-200"
                      >
                        作成中
                      </button>
                    )}
                    <button
                      onClick={() => setStatus(order.id, "done")}
                      className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-bold text-white active:bg-emerald-700"
                    >
                      ✓ 完成
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-full flex-col items-center justify-center p-6 text-center">
      {children}
    </main>
  );
}
