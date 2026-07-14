"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { useRoom } from "@/lib/useRoom";
import { RoomHeader } from "@/components/RoomHeader";
import { yen } from "@/lib/format";
import type { MenuItem } from "@/lib/types";

export default function MenuPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const { room, loading, error } = useRoom(code);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (roomId: string) => {
    const { data } = await supabase
      .from("menu_items")
      .select("*")
      .eq("room_id", roomId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    setItems((data as MenuItem[]) ?? []);
  }, []);

  useEffect(() => {
    if (room) load(room.id);
  }, [room, load]);

  async function addItem() {
    if (!room) return;
    const priceNum = parseInt(price, 10);
    if (!name.trim() || isNaN(priceNum) || priceNum < 0) return;
    setBusy(true);
    const { error: insertError } = await supabase.from("menu_items").insert({
      room_id: room.id,
      name: name.trim(),
      price: priceNum,
      sort_order: items.length,
    });
    setBusy(false);
    if (!insertError) {
      setName("");
      setPrice("");
      load(room.id);
    }
  }

  async function toggleActive(item: MenuItem) {
    if (!room) return;
    await supabase
      .from("menu_items")
      .update({ is_active: !item.is_active })
      .eq("id", item.id);
    load(room.id);
  }

  async function updatePrice(item: MenuItem, newPrice: number) {
    if (!room) return;
    await supabase.from("menu_items").update({ price: newPrice }).eq("id", item.id);
    load(room.id);
  }

  async function removeItem(item: MenuItem) {
    if (!room) return;
    if (!confirm(`「${item.name}」を削除しますか?`)) return;
    await supabase.from("menu_items").delete().eq("id", item.id);
    load(room.id);
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
    <div className="mx-auto max-w-md pb-24">
      <RoomHeader room={room} title="メニュー編集" />

      <div className="p-4">
        {items.length === 0 && (
          <p className="mb-4 text-center text-sm text-slate-400">
            まだ商品がありません。下から追加してください。
          </p>
        )}

        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className={`flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm ${
                item.is_active ? "" : "opacity-50"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{item.name}</p>
                <PriceEditor
                  value={item.price}
                  onSave={(v) => updatePrice(item, v)}
                />
              </div>
              <button
                onClick={() => toggleActive(item)}
                className={`rounded-lg px-3 py-2 text-xs font-bold ${
                  item.is_active
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-200 text-slate-500"
                }`}
              >
                {item.is_active ? "販売中" : "停止中"}
              </button>
              <button
                onClick={() => removeItem(item)}
                className="rounded-lg px-2 py-2 text-lg text-red-400 active:bg-red-50"
                aria-label="削除"
              >
                🗑
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* 追加フォーム(下部固定) */}
      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t bg-white p-3">
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="商品名"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-brand"
          />
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="価格"
            inputMode="numeric"
            className="w-24 rounded-lg border border-slate-300 px-3 py-3 text-right outline-none focus:border-brand"
          />
          <button
            onClick={addItem}
            disabled={busy}
            className="rounded-lg bg-brand px-4 font-bold text-white active:bg-brand-dark disabled:opacity-50"
          >
            追加
          </button>
        </div>
      </div>
    </div>
  );
}

function PriceEditor({
  value,
  onSave,
}: {
  value: number;
  onSave: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  if (!editing) {
    return (
      <button
        onClick={() => {
          setDraft(String(value));
          setEditing(true);
        }}
        className="text-sm text-slate-500 underline decoration-dotted"
      >
        {yen(value)}
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
        className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
        inputMode="numeric"
      />
      <button
        onClick={() => {
          const n = parseInt(draft, 10);
          if (!isNaN(n) && n >= 0) onSave(n);
          setEditing(false);
        }}
        className="rounded bg-brand px-2 py-1 text-xs font-bold text-white"
      >
        保存
      </button>
    </span>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-full flex-col items-center justify-center p-6 text-center">
      {children}
    </main>
  );
}
