"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { errorMessage, roomApi } from "@/lib/api";
import { useRoom } from "@/lib/useRoom";
import { RoomHeader } from "@/components/RoomHeader";
import { yen } from "@/lib/format";
import { downloadCsv, ordersToCsv } from "@/lib/csv";
import type { OrderWithItems } from "@/lib/types";

export default function SalesPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const router = useRouter();
  const { room, loading, error } = useRoom(code);
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setOrders(await roomApi.orders(code, "done"));
    } catch (err) {
      console.error("[sales] 売上の取得に失敗しました:", err);
    }
  }, [code]);

  /** 書き出し・リセット用に、その部屋の全注文(状態問わず)を取得 */
  const fetchAllOrders = useCallback(
    () => roomApi.orders(code, "all"),
    [code]
  );

  function fileStamp() {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(
      d.getHours()
    )}${p(d.getMinutes())}`;
  }

  async function exportCsv() {
    if (!room) return;
    setBusy(true);
    try {
      const all = await fetchAllOrders();
      if (all.length === 0) {
        alert("書き出す注文がありません。");
        return;
      }
      const csv = ordersToCsv(all);
      downloadCsv(`${room.name}_${fileStamp()}.csv`, csv);
    } catch (e) {
      alert("書き出しに失敗しました: " + errorMessage(e, ""));
    } finally {
      setBusy(false);
    }
  }

  async function endBusinessReset() {
    if (!room) return;
    if (
      !confirm(
        "営業終了します。\nまずCSVを書き出し、その後この部屋の注文をすべて削除します。\n(部屋とメニューは残ります)\n\n続けますか?"
      )
    )
      return;
    setBusy(true);
    try {
      const all = await fetchAllOrders();
      if (all.length > 0) {
        downloadCsv(`${room.name}_${fileStamp()}_backup.csv`, ordersToCsv(all));
      }
      await roomApi.clearOrders(code);
      await load();
      alert("営業終了しました。注文をリセットしました。");
    } catch (e) {
      alert("リセットに失敗しました: " + errorMessage(e, ""));
    } finally {
      setBusy(false);
    }
  }

  async function deleteRoom() {
    if (!room) return;
    const answer = prompt(
      `この部屋「${room.name}」を完全に削除します。\nメニューも注文もすべて消え、元に戻せません。\n\n削除するには部屋コード「${room.code}」を入力してください。`
    );
    if (answer?.trim().toUpperCase() !== room.code) {
      if (answer !== null) alert("コードが一致しないため中止しました。");
      return;
    }
    setBusy(true);
    try {
      await roomApi.remove(code, answer);
      alert("部屋を削除しました。");
      router.push("/");
    } catch (e) {
      alert("削除に失敗しました: " + errorMessage(e, ""));
      setBusy(false);
    }
  }

  useEffect(() => {
    if (room) load();
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
    <div className="pb-10">
      <div className={CONTENT_WIDTH}>
        <RoomHeader room={room} title="売上・履歴" />
      </div>

      {/* 画面が広いときは左に集計と操作、右に履歴を並べる */}
      <div
        className={`${CONTENT_WIDTH} grid gap-4 p-4 xl:grid-cols-2 xl:items-start xl:gap-6`}
      >
        <div className="space-y-4">
          {/* サマリー */}
          <div className="grid grid-cols-2 gap-3">
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
          <section>
            <h2 className="mb-2 text-sm font-bold text-slate-500">
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
          </section>

          {/* 運営メニュー */}
          <section>
            <h2 className="mb-2 text-sm font-bold text-slate-500">運営</h2>
            <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
              <button
                onClick={exportCsv}
                disabled={busy}
                className="w-full rounded-lg bg-slate-800 py-3 font-bold text-white active:bg-slate-900 disabled:opacity-50"
              >
                📥 CSVで書き出す
              </button>
              <button
                onClick={endBusinessReset}
                disabled={busy}
                className="w-full rounded-lg border-2 border-amber-500 py-3 font-bold text-amber-600 active:bg-amber-50 disabled:opacity-50"
              >
                🏁 営業終了・注文をリセット
              </button>
              <p className="text-xs text-slate-400">
                リセットすると、CSVを保存したうえで注文履歴だけを削除します。部屋とメニューは残るので、次回もそのまま使えます。
              </p>
            </div>
          </section>

          {/* 危険な操作 */}
          <div className="space-y-2 rounded-2xl border border-red-200 bg-red-50 p-4">
            <h3 className="text-sm font-bold text-red-600">危険な操作</h3>
            <button
              onClick={deleteRoom}
              disabled={busy}
              className="w-full rounded-lg bg-red-600 py-3 font-bold text-white active:bg-red-700 disabled:opacity-50"
            >
              🗑 この部屋を完全に削除
            </button>
            <p className="text-xs text-red-400">
              部屋・メニュー・注文がすべて消え、元に戻せません。
            </p>
          </div>
        </div>

        {/* 完了注文の履歴 */}
        <section>
          <h2 className="mb-2 text-sm font-bold text-slate-500">
            完了した注文 ({orders.length})
          </h2>
          {orders.length === 0 ? (
            <p className="rounded-2xl bg-white p-6 text-center text-sm text-slate-400 shadow-sm">
              まだ完了した注文がありません
            </p>
          ) : (
            <ul className="grid gap-2 2xl:grid-cols-2">
              {orders.map((o) => (
                <li key={o.id} className="rounded-xl bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">#{o.ticket_no}</span>
                    <span className="text-sm text-slate-500">
                      {yen(o.total)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {o.order_items
                      .map((it) => `${it.name}×${it.quantity}`)
                      .join(", ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/** ヘッダーと本文の横幅をそろえる */
const CONTENT_WIDTH = "mx-auto w-full max-w-4xl xl:max-w-[1800px]";

function Center({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-full flex-col items-center justify-center p-6 text-center">
      {children}
    </main>
  );
}
