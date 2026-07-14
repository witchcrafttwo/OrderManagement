"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { useRoom } from "@/lib/useRoom";
import { RoomHeader } from "@/components/RoomHeader";
import { yen } from "@/lib/format";
import type { CartLine, MenuItem } from "@/lib/types";

export default function RegisterPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const { room, loading, error } = useRoom(code);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastTicket, setLastTicket] = useState<number | null>(null);

  const load = useCallback(async (roomId: string) => {
    const { data } = await supabase
      .from("menu_items")
      .select("*")
      .eq("room_id", roomId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    setItems((data as MenuItem[]) ?? []);
  }, []);

  useEffect(() => {
    if (room) load(room.id);
  }, [room, load]);

  const total = useMemo(
    () =>
      Object.values(cart).reduce(
        (sum, line) => sum + line.menuItem.price * line.quantity,
        0
      ),
    [cart]
  );
  const count = useMemo(
    () => Object.values(cart).reduce((sum, line) => sum + line.quantity, 0),
    [cart]
  );

  function addToCart(item: MenuItem) {
    setCart((prev) => {
      const existing = prev[item.id];
      return {
        ...prev,
        [item.id]: {
          menuItem: item,
          quantity: (existing?.quantity ?? 0) + 1,
        },
      };
    });
  }

  function changeQty(itemId: string, delta: number) {
    setCart((prev) => {
      const line = prev[itemId];
      if (!line) return prev;
      const nextQty = line.quantity + delta;
      const next = { ...prev };
      if (nextQty <= 0) {
        delete next[itemId];
      } else {
        next[itemId] = { ...line, quantity: nextQty };
      }
      return next;
    });
  }

  async function submitOrder() {
    if (!room || count === 0) return;
    setSubmitting(true);
    try {
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .insert({
          room_id: room.id,
          total,
          note: note.trim() || null,
          status: "pending",
        })
        .select()
        .single();
      if (orderError) throw orderError;

      const lines = Object.values(cart).map((line) => ({
        order_id: orderData.id,
        menu_item_id: line.menuItem.id,
        name: line.menuItem.name,
        price: line.menuItem.price,
        quantity: line.quantity,
      }));
      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(lines);
      if (itemsError) throw itemsError;

      setLastTicket(orderData.ticket_no);
      setCart({});
      setNote("");
      setTimeout(() => setLastTicket(null), 4000);
    } catch (e) {
      alert(
        "注文の送信に失敗しました: " +
          (e instanceof Error ? e.message : "unknown")
      );
    } finally {
      setSubmitting(false);
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
    <div className="mx-auto flex min-h-full max-w-md flex-col pb-44">
      <RoomHeader room={room} title="レジ" />

      {lastTicket !== null && (
        <div className="mx-4 mt-4 rounded-xl bg-emerald-50 p-4 text-center">
          <p className="text-sm text-emerald-700">注文を送信しました</p>
          <p className="text-2xl font-bold text-emerald-700">
            呼び出し番号 #{lastTicket}
          </p>
        </div>
      )}

      <div className="p-4">
        {items.length === 0 ? (
          <div className="rounded-xl bg-white p-6 text-center text-sm text-slate-400">
            販売中の商品がありません。
            <br />
            <Link
              href={`/room/${room.code}/menu`}
              className="font-bold text-brand underline"
            >
              メニューを編集
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => addToCart(item)}
                className="flex flex-col items-start rounded-2xl bg-white p-4 text-left shadow-sm active:scale-95"
              >
                <span className="font-bold">{item.name}</span>
                <span className="text-sm text-slate-500">{yen(item.price)}</span>
                {cart[item.id] && (
                  <span className="mt-1 rounded-full bg-brand px-2 text-xs font-bold text-white">
                    ×{cart[item.id].quantity}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* カート(下部固定) */}
      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t bg-white">
        {count > 0 && (
          <div className="max-h-48 overflow-y-auto px-4 pt-3">
            {Object.values(cart).map((line) => (
              <div
                key={line.menuItem.id}
                className="flex items-center gap-2 border-b py-2 last:border-0"
              >
                <span className="min-w-0 flex-1 truncate text-sm">
                  {line.menuItem.name}
                </span>
                <span className="text-xs text-slate-400">
                  {yen(line.menuItem.price)}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => changeQty(line.menuItem.id, -1)}
                    className="h-8 w-8 rounded-full bg-slate-100 text-lg font-bold active:bg-slate-200"
                  >
                    −
                  </button>
                  <span className="w-5 text-center font-bold">
                    {line.quantity}
                  </span>
                  <button
                    onClick={() => changeQty(line.menuItem.id, 1)}
                    className="h-8 w-8 rounded-full bg-slate-100 text-lg font-bold active:bg-slate-200"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="備考(トッピング・アレルギー等)"
              className="my-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </div>
        )}
        <div className="flex items-center gap-3 p-4">
          <div className="flex-1">
            <p className="text-xs text-slate-400">合計 {count}点</p>
            <p className="text-xl font-bold">{yen(total)}</p>
          </div>
          <button
            onClick={submitOrder}
            disabled={count === 0 || submitting}
            className="rounded-xl bg-brand px-6 py-3 font-bold text-white active:bg-brand-dark disabled:opacity-40"
          >
            {submitting ? "送信中..." : "注文を送る"}
          </button>
        </div>
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
