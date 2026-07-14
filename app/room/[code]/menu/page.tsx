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

  async function updateName(item: MenuItem, newName: string) {
    if (!room) return;
    const trimmed = newName.trim();
    if (!trimmed || trimmed === item.name) return;
    await supabase.from("menu_items").update({ name: trimmed }).eq("id", item.id);
    load(room.id);
  }

  async function moveItem(index: number, dir: -1 | 1) {
    if (!room || busy) return;
    const target = index + dir;
    if (target < 0 || target >= items.length) return;

    // ローカルで並べ替え(楽観的更新)
    const reordered = [...items];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    setItems(reordered);

    // sort_order がずれている項目だけを連番で保存
    setBusy(true);
    try {
      const changed = reordered
        .map((it, i) => ({ it, i }))
        .filter(({ it, i }) => it.sort_order !== i);
      await Promise.all(
        changed.map(({ it, i }) =>
          supabase.from("menu_items").update({ sort_order: i }).eq("id", it.id)
        )
      );
      await load(room.id);
    } finally {
      setBusy(false);
    }
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
          {items.map((item, index) => (
            <li
              key={item.id}
              className={`flex items-center gap-2 rounded-xl bg-white p-3 shadow-sm ${
                item.is_active ? "" : "opacity-50"
              }`}
            >
              <div className="flex flex-col">
                <button
                  onClick={() => moveItem(index, -1)}
                  disabled={index === 0 || busy}
                  className="flex h-6 w-6 items-center justify-center rounded text-slate-400 active:bg-slate-100 disabled:opacity-20"
                  aria-label="上へ"
                >
                  ▲
                </button>
                <button
                  onClick={() => moveItem(index, 1)}
                  disabled={index === items.length - 1 || busy}
                  className="flex h-6 w-6 items-center justify-center rounded text-slate-400 active:bg-slate-100 disabled:opacity-20"
                  aria-label="下へ"
                >
                  ▼
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <NameEditor
                  value={item.name}
                  onSave={(v) => updateName(item, v)}
                />
                <PriceEditor
                  value={item.price}
                  onSave={(v) => updatePrice(item, v)}
                />
              </div>
              <Link
                href={`/room/${room.code}/menu/${item.id}`}
                className="rounded-lg px-2 py-2 text-lg active:bg-slate-100"
                aria-label="オプション設定"
                title="オプション設定"
              >
                ⚙
              </Link>
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

function NameEditor({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <button
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className="flex items-center gap-1 truncate text-left font-bold"
      >
        <span className="truncate">{value}</span>
        <span className="text-xs text-slate-300">✎</span>
      </button>
    );
  }

  function commit() {
    onSave(draft);
    setEditing(false);
  }

  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 font-bold outline-none focus:border-brand"
      />
      <button
        onClick={commit}
        className="rounded bg-brand px-2 py-1 text-xs font-bold text-white"
      >
        保存
      </button>
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
