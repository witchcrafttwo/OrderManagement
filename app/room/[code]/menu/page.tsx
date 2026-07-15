"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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

  async function updateSize(item: MenuItem, size: number) {
    if (!room || item.size === size) return;
    await supabase.from("menu_items").update({ size }).eq("id", item.id);
    load(room.id);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!room || !over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(items, oldIndex, newIndex);
    setItems(reordered); // 楽観的更新

    // sort_order がずれた項目だけ連番で保存
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
    <div className="mx-auto max-w-2xl pb-24">
      <RoomHeader room={room} title="メニュー編集" />

      <div className="p-4">
        {items.length === 0 ? (
          <p className="mb-4 text-center text-sm text-slate-400">
            まだ商品がありません。下から追加してください。
          </p>
        ) : (
          <p className="mb-2 text-center text-xs text-slate-400">
            ⠿ をドラッグで並び替え
          </p>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-2">
              {items.map((item) => (
                <SortableRow
                  key={item.id}
                  item={item}
                  roomCode={room.code}
                  onToggleActive={() => toggleActive(item)}
                  onRemove={() => removeItem(item)}
                  onSaveName={(v) => updateName(item, v)}
                  onSavePrice={(v) => updatePrice(item, v)}
                  onSetSize={(s) => updateSize(item, s)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </div>

      {/* 追加フォーム(下部固定) */}
      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-2xl border-t bg-white p-3">
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

const SIZE_OPTIONS = [
  { value: 1, label: "小" },
  { value: 2, label: "中" },
  { value: 3, label: "大" },
];

function SortableRow({
  item,
  roomCode,
  onToggleActive,
  onRemove,
  onSaveName,
  onSavePrice,
  onSetSize,
}: {
  item: MenuItem;
  roomCode: string;
  onToggleActive: () => void;
  onRemove: () => void;
  onSaveName: (v: string) => void;
  onSavePrice: (v: number) => void;
  onSetSize: (size: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`rounded-xl bg-white p-3 shadow-sm ${
        item.is_active ? "" : "opacity-50"
      } ${isDragging ? "shadow-lg ring-2 ring-brand" : ""}`}
    >
      <div className="flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none px-1 text-lg text-slate-300 active:cursor-grabbing"
          aria-label="ドラッグして並び替え"
        >
          ⠿
        </button>
        <div className="min-w-0 flex-1">
          <NameEditor value={item.name} onSave={onSaveName} />
          <PriceEditor value={item.price} onSave={onSavePrice} />
        </div>
        <Link
          href={`/room/${roomCode}/menu/${item.id}`}
          className="rounded-lg px-2 py-2 text-lg active:bg-slate-100"
          aria-label="オプション設定"
          title="オプション設定"
        >
          ⚙
        </Link>
        <button
          onClick={onToggleActive}
          className={`rounded-lg px-3 py-2 text-xs font-bold ${
            item.is_active
              ? "bg-emerald-100 text-emerald-700"
              : "bg-slate-200 text-slate-500"
          }`}
        >
          {item.is_active ? "販売中" : "停止中"}
        </button>
        <button
          onClick={onRemove}
          className="rounded-lg px-2 py-2 text-lg text-red-400 active:bg-red-50"
          aria-label="削除"
        >
          🗑
        </button>
      </div>

      {/* レジ表示サイズ */}
      <div className="mt-2 flex items-center gap-2 pl-8">
        <span className="text-xs text-slate-400">レジ表示</span>
        <div className="flex overflow-hidden rounded-lg border border-slate-200">
          {SIZE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onSetSize(opt.value)}
              className={`px-3 py-1 text-xs font-bold ${
                item.size === opt.value
                  ? "bg-brand text-white"
                  : "bg-white text-slate-500"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </li>
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
