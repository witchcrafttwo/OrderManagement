"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { useRoom } from "@/lib/useRoom";
import { RoomHeader } from "@/components/RoomHeader";
import { yen } from "@/lib/format";
import type { OrderWithItems } from "@/lib/types";

export default function SalesPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const { room, loading, error } = useRoom(code);
  const [orders, setOrders] = useState<OrderWithItems[]>([]);

  const load = useCallback(async (roomId: string) => {
    const { data } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("room_id", roomId)
      .eq("status", "done")
      .order("completed_at", { ascending: false });
    setOrders((data as OrderWithItems[]) ?? []);
  }, []);

  useEffect(() => {
    if (room) load(room.id);
  }, [room, load]);

  const stats = useMemo(() => {
    const totalSales = orders.reduce((s, o) => s + o.total, 0);
    const orderCount = orders.length;
    // 商品別の販売数集計
    const byItem: Record<string, { name: string; qty: number; sales: number }> =
      {};
    for (const o of orders) {
      for (const it of o.order_items) {
        const key = it.name;
        if (!byItem[key]) byItem[key] = { name: it.name, qty: 0, sales: 0 };
        byItem[key].qty += it.quantity;
        byItem[key].sales += it.price * it.quantity;
      }
    }
    const ranking = Object.values(byItem).sort((a, b) => b.qty - a.qty);
    return { totalSales, orderCount, ranking };
  }, [orders]);

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
    <div className="mx-auto max-w-md pb-10">
      <RoomHeader room={room} title="売上・履歴" />

      <div className="grid grid-cols-2 gap-3 p-4">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-400">売上合計</p>
          <p className="text-2xl font-bold text-brand">
            {yen(stats.totalSales)}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-400">完了注文数</p>
          <p className="text-2xl font-bold">{stats.orderCount}件</p>
        </div>
      </div>

      {/* 商品別ランキング */}
      <div className="px-4">
        <h2 className="mb-2 mt-2 text-sm font-bold text-slate-500">
          商品別 販売数
        </h2>
        <div className="rounded-2xl bg-white p-2 shadow-sm">
          {stats.ranking.length === 0 ? (
            <p className="p-4 text-center text-sm text-slate-400">
              まだ売上がありません
            </p>
          ) : (
            <ul>
              {stats.ranking.map((r, i) => (
                <li
                  key={r.name}
                  className="flex items-center gap-3 border-b p-3 last:border-0"
                >
                  <span className="w-5 text-center font-bold text-slate-300">
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate">{r.name}</span>
                  <span className="font-bold">{r.qty}個</span>
                  <span className="w-20 text-right text-sm text-slate-400">
                    {yen(r.sales)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 完了注文の履歴 */}
      <div className="px-4">
        <h2 className="mb-2 mt-6 text-sm font-bold text-slate-500">
          完了した注文
        </h2>
        <ul className="space-y-2">
          {orders.map((o) => (
            <li key={o.id} className="rounded-xl bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-bold">#{o.ticket_no}</span>
                <span className="text-sm text-slate-500">{yen(o.total)}</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {o.order_items
                  .map((it) => `${it.name}×${it.quantity}`)
                  .join(", ")}
              </p>
            </li>
          ))}
        </ul>
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
