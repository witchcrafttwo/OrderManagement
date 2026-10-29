"use client";

import {
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { errorMessage, roomApi } from "@/lib/api";
import { useRoom } from "@/lib/useRoom";
import { useRoomStream } from "@/lib/useRoomStream";
import { RoomHeader } from "@/components/RoomHeader";
import { elapsed, yen } from "@/lib/format";
import { summarizeOrders } from "@/lib/kitchen";
import type { OrderWithItems, RoomChange } from "@/lib/types";

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

  // 「作るもの」集計の開閉
  const [showSummary, setShowSummary] = useState(true);

  // 保存済みの設定を復元
  useEffect(() => {
    setSoundOn(localStorage.getItem("kitchen_sound") === "on");
    setShowSummary(localStorage.getItem("kitchen_summary") !== "off");
  }, []);

  function toggleSummary() {
    const next = !showSummary;
    setShowSummary(next);
    localStorage.setItem("kitchen_summary", next ? "on" : "off");
  }
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

  const load = useCallback(async () => {
    try {
      setOrders(await roomApi.orders(code, "active"));
    } catch (err) {
      console.error("[kitchen] 注文の取得に失敗しました:", err);
    }
  }, [code]);

  // 初回ロード
  useEffect(() => {
    if (room) load();
  }, [room, load]);

  // いま溜まっている商品の集計
  const summary = useMemo(() => summarizeOrders(orders), [orders]);

  /** 新規注文が入ったときの通知音 */
  const playNotifySound = useCallback(() => {
    if (!soundOnRef.current || !audioRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {});
  }, []);

  // サーバーからの変更通知(SSE)を受けて読み直す
  const handleRoomChange = useCallback(
    (change: RoomChange) => {
      if (change.table === "orders" && change.event === "INSERT") {
        playNotifySound();
      }
      load();
    },
    [load, playNotifySound]
  );
  useRoomStream(room ? code : null, handleRoomChange);

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
    try {
      await roomApi.setOrderStatus(code, orderId, status);
    } catch (err) {
      alert(errorMessage(err, "状態の更新に失敗しました"));
      load(); // 楽観的更新を元に戻す
    }
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
    <div className="mx-auto w-full max-w-[1600px]">
      <RoomHeader room={room} title={`厨房 (${orders.length}件)`} />

      {/* 通知音の音源(public/notify.mp3) */}
      <audio ref={audioRef} src={NOTIFY_SOUND_SRC} preload="auto" />

      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <button
          onClick={toggleSummary}
          aria-expanded={showSummary}
          className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm active:bg-slate-100"
        >
          📋 作るもの {showSummary ? "▲" : "▼"}
        </button>
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

      {/* いま溜まっている商品の集計 */}
      {showSummary && summary.rows.length > 0 && (
        <div className="mx-4 mt-2 rounded-2xl bg-white p-3 shadow-sm">
          <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>
              未着手{" "}
              <b className="text-base text-slate-800">
                {summary.pendingOrders}
              </b>
              件
            </span>
            <span>
              作成中{" "}
              <b className="text-base text-amber-600">
                {summary.preparingOrders}
              </b>
              件
            </span>
            <span>
              商品{" "}
              <b className="text-base text-slate-800">{summary.totalItems}</b>点
            </span>
          </div>

          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
            {summary.rows.map((row) => (
              <li
                key={row.name}
                className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold" title={row.name}>
                    {row.name}
                  </p>
                  {row.preparing > 0 && (
                    <p className="text-[0.65rem] text-slate-400">
                      未着手 {row.pending} / 作成中 {row.preparing}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-2xl font-bold text-brand">
                  ×{row.total}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="p-4">
        {orders.length === 0 ? (
          <div className="rounded-xl bg-white p-10 text-center text-slate-400">
            <p className="text-4xl">🍳</p>
            <p className="mt-2">未完成の注文はありません</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
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
