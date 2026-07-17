"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { useRoom } from "@/lib/useRoom";
import { RoomHeader } from "@/components/RoomHeader";
import { OrderOptionModal } from "@/components/OrderOptionModal";
import { yen } from "@/lib/format";
import { buildOptionForest, composeCartLine, hasOptions } from "@/lib/options";
import type {
  CartLine,
  MenuItem,
  OptionNode,
  SelectedOption,
} from "@/lib/types";

export default function RegisterPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const { room, loading, error } = useRoom(code);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [optionNodes, setOptionNodes] = useState<OptionNode[]>([]);
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastTicket, setLastTicket] = useState<number | null>(null);
  const [optionItem, setOptionItem] = useState<MenuItem | null>(null);
  const [sizeLevel, setSizeLevel] = useState<1 | 2 | 3>(2);

  // 端末ごとの表示サイズ設定を復元
  useEffect(() => {
    const v = Number(localStorage.getItem("register_size"));
    if (v === 1 || v === 2 || v === 3) setSizeLevel(v);
  }, []);

  function changeSize(v: 1 | 2 | 3) {
    setSizeLevel(v);
    localStorage.setItem("register_size", String(v));
  }

  const load = useCallback(async (roomId: string) => {
    const [{ data: itemData }, { data: nodeData }] = await Promise.all([
      supabase
        .from("menu_items")
        .select("*")
        .eq("room_id", roomId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase.from("option_nodes").select("*").eq("room_id", roomId),
    ]);
    setItems((itemData as MenuItem[]) ?? []);
    setOptionNodes((nodeData as OptionNode[]) ?? []);
  }, []);

  useEffect(() => {
    if (room) load(room.id);
  }, [room, load]);

  const total = useMemo(
    () =>
      Object.values(cart).reduce(
        (sum, line) => sum + line.unitPrice * line.quantity,
        0
      ),
    [cart]
  );
  const count = useMemo(
    () => Object.values(cart).reduce((sum, line) => sum + line.quantity, 0),
    [cart]
  );

  /** オプション確定後、または無オプション商品をカートに積む */
  function addLineToCart(item: MenuItem, options: SelectedOption[]) {
    const { key, displayName, unitPrice } = composeCartLine(item, options);
    setCart((prev) => {
      const existing = prev[key];
      return {
        ...prev,
        [key]: {
          key,
          menuItem: item,
          options,
          displayName,
          unitPrice,
          quantity: (existing?.quantity ?? 0) + 1,
        },
      };
    });
  }

  function onTapItem(item: MenuItem) {
    if (hasOptions(optionNodes, item.id)) {
      setOptionItem(item);
    } else {
      addLineToCart(item, []);
    }
  }

  function changeQty(key: string, delta: number) {
    setCart((prev) => {
      const line = prev[key];
      if (!line) return prev;
      const nextQty = line.quantity + delta;
      const next = { ...prev };
      if (nextQty <= 0) {
        delete next[key];
      } else {
        next[key] = { ...line, quantity: nextQty };
      }
      return next;
    });
  }

  const qtyForItem = useCallback(
    (itemId: string) =>
      Object.values(cart)
        .filter((l) => l.menuItem.id === itemId)
        .reduce((s, l) => s + l.quantity, 0),
    [cart]
  );

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
        name: line.displayName,
        price: line.unitPrice,
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
    <div className="mx-auto flex min-h-full w-full max-w-[1600px] flex-col pb-44">
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
          <>
            {/* 表示サイズ切り替え(全体) */}
            <div className="mb-3 flex items-center justify-end gap-2">
              <span className="text-xs text-slate-400">表示サイズ</span>
              <div className="flex overflow-hidden rounded-lg border border-slate-200">
                {([
                  [1, "小"],
                  [2, "中"],
                  [3, "大"],
                ] as const).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => changeSize(v)}
                    className={`px-4 py-1.5 text-sm font-bold ${
                      sizeLevel === v
                        ? "bg-brand text-white"
                        : "bg-white text-slate-500"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className={`grid gap-3 ${SIZE_PRESETS[sizeLevel].grid}`}>
              {items.map((item) => {
                const qty = qtyForItem(item.id);
                const preset = SIZE_PRESETS[sizeLevel];
                return (
                  <button
                    key={item.id}
                    onClick={() => onTapItem(item)}
                    className={`flex flex-col items-start rounded-2xl bg-white text-left shadow-sm active:scale-95 ${preset.pad}`}
                  >
                    <span className={`font-bold ${preset.name}`}>
                      {item.name}
                    </span>
                    <span className={`text-slate-500 ${preset.price}`}>
                      {yen(item.price)}
                      {hasOptions(optionNodes, item.id) && (
                        <span className="ml-1 text-xs text-brand">〜</span>
                      )}
                    </span>
                    {qty > 0 && (
                      <span className="mt-1 rounded-full bg-brand px-2 text-xs font-bold text-white">
                        ×{qty}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* カート(下部固定) */}
      <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-[1600px] border-t bg-white">
        {count > 0 && (
          <div className="max-h-48 overflow-y-auto px-4 pt-3">
            {Object.values(cart).map((line) => (
              <div
                key={line.key}
                className="flex items-center gap-2 border-b py-2 last:border-0"
              >
                <span className="min-w-0 flex-1 truncate text-sm">
                  {line.displayName}
                </span>
                <span className="text-xs text-slate-400">
                  {yen(line.unitPrice)}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => changeQty(line.key, -1)}
                    className="h-8 w-8 rounded-full bg-slate-100 text-lg font-bold active:bg-slate-200"
                  >
                    −
                  </button>
                  <span className="w-5 text-center font-bold">
                    {line.quantity}
                  </span>
                  <button
                    onClick={() => changeQty(line.key, 1)}
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

      {/* オプション選択モーダル */}
      {optionItem && (
        <OrderOptionModal
          item={optionItem}
          roots={buildOptionForest(optionNodes, optionItem.id)}
          onClose={() => setOptionItem(null)}
          onConfirm={(options) => {
            addLineToCart(optionItem, options);
            setOptionItem(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * レジ全体の表示サイズプリセット(1=小/2=中/3=大)。
 * ※ grid 列数のクラスは Tailwind が拾えるよう、必ずリテラルで記述すること。
 */
const SIZE_PRESETS: Record<
  1 | 2 | 3,
  { grid: string; pad: string; name: string; price: string }
> = {
  1: {
    grid: "grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10",
    pad: "p-2",
    name: "text-sm",
    price: "text-xs",
  },
  2: {
    grid: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7",
    pad: "p-4",
    name: "text-base",
    price: "text-sm",
  },
  3: {
    grid: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5",
    pad: "p-6",
    name: "text-2xl",
    price: "text-lg",
  },
};

function Center({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-full flex-col items-center justify-center p-6 text-center">
      {children}
    </main>
  );
}
