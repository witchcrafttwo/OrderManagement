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
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { errorMessage, roomApi } from "@/lib/api";
import { useRoom } from "@/lib/useRoom";
import { RoomHeader } from "@/components/RoomHeader";
import { minutesLabel, yen } from "@/lib/format";
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
  const [prepMinutes, setPrepMinutes] = useState("");
  const [busy, setBusy] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const load = useCallback(async () => {
    try {
      const menu = await roomApi.menu(code);
      setItems(menu.items);
    } catch (err) {
      console.error("[menu] メニューの取得に失敗しました:", err);
    }
  }, [code]);

  useEffect(() => {
    if (room) load();
  }, [room, load]);

  /** 更新系の共通処理: 実行して読み直し、失敗したら知らせる */
  async function run(action: () => Promise<unknown>, failMessage: string) {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (e) {
      alert(errorMessage(e, failMessage));
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function addItem() {
    const priceNum = parseInt(price, 10);
    if (!name.trim() || isNaN(priceNum) || priceNum < 0) return;
    // 製作時間は空欄なら0分(待ち時間に加算しない)
    const prepNum = prepMinutes === "" ? 0 : parseInt(prepMinutes, 10);
    if (isNaN(prepNum) || prepNum < 0) return;

    const newName = name.trim();
    await run(async () => {
      await roomApi.addMenuItem(code, {
        name: newName,
        price: priceNum,
        prep_minutes: prepNum,
      });
      setName("");
      setPrice("");
      setPrepMinutes("");
    }, "商品の追加に失敗しました");
  }

  function toggleActive(item: MenuItem) {
    return run(
      () =>
        roomApi.updateMenuItem(code, item.id, { is_active: !item.is_active }),
      "販売状態の変更に失敗しました"
    );
  }

  function updatePrice(item: MenuItem, newPrice: number) {
    return run(
      () => roomApi.updateMenuItem(code, item.id, { price: newPrice }),
      "価格の変更に失敗しました"
    );
  }

  function updatePrep(item: MenuItem, newMinutes: number) {
    return run(
      () => roomApi.updateMenuItem(code, item.id, { prep_minutes: newMinutes }),
      "製作時間の変更に失敗しました"
    );
  }

  function updateName(item: MenuItem, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === item.name) return;
    return run(
      () => roomApi.updateMenuItem(code, item.id, { name: trimmed }),
      "商品名の変更に失敗しました"
    );
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(items, oldIndex, newIndex);
    setItems(reordered); // 楽観的更新

    // 並び順はまとめて1リクエストで保存する
    await run(
      () => roomApi.reorderMenu(code, reordered.map((it) => it.id)),
      "並び替えの保存に失敗しました"
    );
  }

  function removeItem(item: MenuItem) {
    if (!confirm(`「${item.name}」を削除しますか?`)) return;
    return run(
      () => roomApi.deleteMenuItem(code, item.id),
      "削除に失敗しました"
    );
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
    // 画面ぴったりに収め、一覧だけを中でスクロールさせる
    // (追加フォームを fixed にすると横画面で一覧を覆ってしまうため)
    <div className="flex h-dvh flex-col overflow-hidden">
      <div className="shrink-0">
        <RoomHeader room={room} title="メニュー編集" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
        <div className={CONTENT_WIDTH}>
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
              strategy={rectSortingStrategy}
            >
              {/* 画面が広いときは複数列に並べる */}
              <ul className="grid gap-2 xl:grid-cols-2 2xl:grid-cols-3">
                {items.map((item) => (
                  <SortableRow
                    key={item.id}
                    item={item}
                    roomCode={room.code}
                    onToggleActive={() => toggleActive(item)}
                    onRemove={() => removeItem(item)}
                    onSaveName={(v) => updateName(item, v)}
                    onSavePrice={(v) => updatePrice(item, v)}
                    onSavePrep={(v) => updatePrep(item, v)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </div>
      </div>

      {/* 追加フォーム(一覧の下に置く。背が低い画面では1段にまとめる) */}
      <div className="shrink-0 border-t bg-white px-3 py-2 sm:px-4 sm:py-3">
        <div className={CONTENT_WIDTH}>
          <div className="flex flex-col gap-2 landscape:flex-row landscape:items-center">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
              placeholder="商品名"
              aria-label="商品名"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-brand sm:py-3 landscape:flex-1"
            />
            <div className="flex shrink-0 gap-2">
              <SuffixInput
                value={price}
                onChange={setPrice}
                placeholder="価格"
                suffix="円"
                label="価格"
              />
              <SuffixInput
                value={prepMinutes}
                onChange={setPrepMinutes}
                placeholder="製作時間"
                suffix="分"
                label="製作時間(分)"
              />
              <button
                onClick={addItem}
                disabled={busy}
                className="shrink-0 rounded-lg bg-brand px-4 py-2.5 font-bold text-white active:bg-brand-dark disabled:opacity-50 sm:py-3"
              >
                追加
              </button>
            </div>
          </div>
          {/* 背の低い画面では説明を省いて一覧の領域を稼ぐ */}
          <p className="mt-1.5 text-xs text-slate-400 [@media(max-height:560px)]:hidden">
            ⏱ 製作時間は待ち時間ボードの計算に使います。空欄なら0分(待ち時間に加算しません)。
          </p>
        </div>
      </div>
    </div>
  );
}

/** 一覧と追加フォームの横幅をそろえる */
const CONTENT_WIDTH = "mx-auto w-full max-w-3xl xl:max-w-[1800px]";

function SortableRow({
  item,
  roomCode,
  onToggleActive,
  onRemove,
  onSaveName,
  onSavePrice,
  onSavePrep,
}: {
  item: MenuItem;
  roomCode: string;
  onToggleActive: () => void;
  onRemove: () => void;
  onSaveName: (v: string) => void;
  onSavePrice: (v: number) => void;
  onSavePrep: (v: number) => void;
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
      className={`flex items-center gap-1 rounded-xl bg-white p-2.5 shadow-sm sm:gap-2 sm:p-3 ${
        item.is_active ? "" : "opacity-50"
      } ${isDragging ? "shadow-lg ring-2 ring-brand" : ""}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab touch-none px-1 text-lg text-slate-300 active:cursor-grabbing"
        aria-label="ドラッグして並び替え"
      >
        ⠿
      </button>
      <div className="min-w-0 flex-1">
        <NameEditor value={item.name} onSave={onSaveName} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <NumberEditor
            value={item.price}
            onSave={onSavePrice}
            format={(v) => yen(v)}
            label="価格を編集"
            suffix="円"
          />
          <NumberEditor
            value={item.prep_minutes}
            onSave={onSavePrep}
            format={(v) => (v > 0 ? `⏱ ${minutesLabel(v)}` : "⏱ 時間なし")}
            label="製作時間を編集"
            suffix="分"
          />
        </div>
      </div>
      <Link
        href={`/room/${roomCode}/menu/${item.id}`}
        className="shrink-0 rounded-lg px-1.5 py-2 text-lg active:bg-slate-100 sm:px-2"
        aria-label="オプション設定"
        title="オプション設定"
      >
        ⚙
      </Link>
      <button
        onClick={onToggleActive}
        className={`shrink-0 rounded-lg px-2 py-2 text-xs font-bold sm:px-3 ${
          item.is_active
            ? "bg-emerald-100 text-emerald-700"
            : "bg-slate-200 text-slate-500"
        }`}
      >
        {item.is_active ? "販売中" : "停止中"}
      </button>
      <button
        onClick={onRemove}
        className="shrink-0 rounded-lg px-1.5 py-2 text-lg text-red-400 active:bg-red-50 sm:px-2"
        aria-label="削除"
      >
        🗑
      </button>
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

/** 0以上の整数をその場で編集する(価格・製作時間で共用) */
function NumberEditor({
  value,
  onSave,
  format,
  label,
  suffix,
}: {
  value: number;
  onSave: (v: number) => void;
  format: (v: number) => string;
  label: string;
  suffix: string;
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
        aria-label={label}
        className="text-sm text-slate-500 underline decoration-dotted"
      >
        {format(value)}
      </button>
    );
  }

  function commit() {
    const n = parseInt(draft, 10);
    if (!isNaN(n) && n >= 0) onSave(n);
    setEditing(false);
  }

  return (
    <span className="flex items-center gap-1">
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        aria-label={label}
        className="w-16 rounded border border-slate-300 px-2 py-1 text-sm"
        inputMode="numeric"
      />
      <span className="text-xs text-slate-400">{suffix}</span>
      <button
        onClick={commit}
        className="rounded bg-brand px-2 py-1 text-xs font-bold text-white"
      >
        保存
      </button>
    </span>
  );
}

/** 単位つきの数値入力(追加フォーム用) */
function SuffixInput({
  value,
  onChange,
  placeholder,
  suffix,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  suffix: string;
  label: string;
}) {
  return (
    <div className="relative min-w-[5.5rem] flex-1">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
        placeholder={placeholder}
        inputMode="numeric"
        aria-label={label}
        className="w-full rounded-lg border border-slate-300 py-2.5 pl-2 pr-7 text-right outline-none focus:border-brand sm:py-3 sm:pl-3 sm:pr-8"
      />
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-slate-400 sm:right-3 sm:text-sm">
        {suffix}
      </span>
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
