"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { useRoom } from "@/lib/useRoom";
import { RoomHeader } from "@/components/RoomHeader";
import { buildOptionForest, type OptionTreeNode } from "@/lib/options";
import { yen } from "@/lib/format";
import type { MenuItem, OptionNode } from "@/lib/types";

interface Actions {
  addOption: (groupId: string, order: number) => void;
  addChildGroup: (optionId: string, order: number) => void;
  updateLabel: (id: string, label: string) => void;
  updatePrice: (id: string, price: number) => void;
  toggleOptional: (node: OptionTreeNode) => void;
  remove: (id: string, label: string) => void;
}

export default function OptionEditorPage({
  params,
}: {
  params: Promise<{ code: string; itemId: string }>;
}) {
  const { code, itemId } = use(params);
  const { room, loading, error } = useRoom(code);
  const [item, setItem] = useState<MenuItem | null>(null);
  const [nodes, setNodes] = useState<OptionNode[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: itemData }, { data: nodeData }] = await Promise.all([
      supabase.from("menu_items").select("*").eq("id", itemId).maybeSingle(),
      supabase.from("option_nodes").select("*").eq("menu_item_id", itemId),
    ]);
    setItem((itemData as MenuItem) ?? null);
    setNodes((nodeData as OptionNode[]) ?? []);
  }, [itemId]);

  useEffect(() => {
    if (room) load();
  }, [room, load]);

  const roots = buildOptionForest(nodes, itemId);

  async function run(fn: () => PromiseLike<unknown>) {
    setBusy(true);
    try {
      await fn();
      await load();
    } finally {
      setBusy(false);
    }
  }

  const actions: Actions = {
    addOption: (groupId, order) =>
      run(() =>
        supabase.from("option_nodes").insert({
          room_id: room!.id,
          menu_item_id: itemId,
          parent_id: groupId,
          node_type: "option",
          label: "新しい選択肢",
          sort_order: order,
        })
      ),
    addChildGroup: (optionId, order) =>
      run(() =>
        supabase.from("option_nodes").insert({
          room_id: room!.id,
          menu_item_id: itemId,
          parent_id: optionId,
          node_type: "group",
          label: "新しい質問",
          sort_order: order,
        })
      ),
    updateLabel: (id, label) =>
      run(() =>
        supabase.from("option_nodes").update({ label }).eq("id", id)
      ),
    updatePrice: (id, price) =>
      run(() =>
        supabase.from("option_nodes").update({ price_delta: price }).eq("id", id)
      ),
    toggleOptional: (node) =>
      run(() =>
        supabase
          .from("option_nodes")
          .update({ optional: !node.optional })
          .eq("id", node.id)
      ),
    remove: (id, label) => {
      if (!confirm(`「${label}」とその中身をすべて削除しますか?`)) return;
      run(() => supabase.from("option_nodes").delete().eq("id", id));
    },
  };

  function addTopGroup() {
    run(() =>
      supabase.from("option_nodes").insert({
        room_id: room!.id,
        menu_item_id: itemId,
        parent_id: null,
        node_type: "group",
        label: "新しい質問",
        sort_order: roots.length,
      })
    );
  }

  if (loading) return <Center>読み込み中...</Center>;
  if (error || !room || !item)
    return (
      <Center>
        <p className="mb-4 text-red-600">
          {error ?? "商品が見つかりません"}
        </p>
        <Link href={`/room/${code}/menu`} className="font-bold text-brand underline">
          メニューに戻る
        </Link>
      </Center>
    );

  return (
    <div className="mx-auto max-w-md pb-24">
      <RoomHeader room={room} title={`オプション設定: ${item.name}`} />

      <div className="p-4">
        <p className="mb-4 text-xs text-slate-500">
          「質問(選択グループ)」を追加し、その中に「選択肢」を並べます。選択肢の中にさらに質問を足せば、何段階でも深くできます。
        </p>

        {roots.length === 0 && (
          <p className="mb-4 rounded-xl bg-white p-6 text-center text-sm text-slate-400 shadow-sm">
            まだオプションがありません。下のボタンで質問を追加してください。
          </p>
        )}

        <div className="space-y-3">
          {roots.map((g) => (
            <GroupBlock key={g.id} group={g} actions={actions} busy={busy} />
          ))}
        </div>

        <button
          onClick={addTopGroup}
          disabled={busy}
          className="mt-4 w-full rounded-lg border-2 border-dashed border-brand py-3 font-bold text-brand active:bg-orange-50 disabled:opacity-50"
        >
          ＋ 質問(選択グループ)を追加
        </button>
      </div>
    </div>
  );
}

function GroupBlock({
  group,
  actions,
  busy,
}: {
  group: OptionTreeNode;
  actions: Actions;
  busy: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-slate-400">質問</span>
        <InlineText
          value={group.label}
          onSave={(v) => actions.updateLabel(group.id, v)}
          className="flex-1 font-bold"
        />
        <button
          onClick={() => actions.toggleOptional(group)}
          className={`rounded px-2 py-1 text-xs font-bold ${
            group.optional
              ? "bg-emerald-100 text-emerald-700"
              : "bg-slate-100 text-slate-500"
          }`}
        >
          {group.optional ? "任意(なし可)" : "必須"}
        </button>
        <button
          onClick={() => actions.remove(group.id, group.label)}
          className="px-1 text-red-400"
          aria-label="削除"
        >
          🗑
        </button>
      </div>

      <div className="mt-2 space-y-2 border-l-2 border-slate-100 pl-3">
        {group.children.map((opt) => (
          <OptionBlock key={opt.id} option={opt} actions={actions} busy={busy} />
        ))}
        <button
          onClick={() => actions.addOption(group.id, group.children.length)}
          disabled={busy}
          className="w-full rounded-lg bg-slate-50 py-2 text-xs font-bold text-slate-500 active:bg-slate-100 disabled:opacity-50"
        >
          ＋ 選択肢を追加
        </button>
      </div>
    </div>
  );
}

function OptionBlock({
  option,
  actions,
  busy,
}: {
  option: OptionTreeNode;
  actions: Actions;
  busy: boolean;
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <div className="flex items-center gap-2">
        <span className="text-slate-300">・</span>
        <InlineText
          value={option.label}
          onSave={(v) => actions.updateLabel(option.id, v)}
          className="flex-1"
        />
        <span className="text-xs text-slate-400">+</span>
        <InlineNumber
          value={option.price_delta}
          onSave={(v) => actions.updatePrice(option.id, v)}
        />
        <button
          onClick={() => actions.remove(option.id, option.label)}
          className="px-1 text-red-400"
          aria-label="削除"
        >
          ✕
        </button>
      </div>

      {/* この選択肢の下にさらに質問(ネスト) */}
      <div className="mt-2 space-y-2 pl-4">
        {option.children.map((g) => (
          <GroupBlock key={g.id} group={g} actions={actions} busy={busy} />
        ))}
        <button
          onClick={() => actions.addChildGroup(option.id, option.children.length)}
          disabled={busy}
          className="text-xs font-bold text-brand disabled:opacity-50"
        >
          ＋ さらに質問を追加(ネスト)
        </button>
      </div>
    </div>
  );
}

function InlineText({
  value,
  onSave,
  className = "",
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const t = draft.trim();
        if (t && t !== value) onSave(t);
        else setDraft(value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={`rounded border border-transparent bg-transparent px-1 py-0.5 outline-none focus:border-slate-300 focus:bg-white ${className}`}
    />
  );
}

function InlineNumber({
  value,
  onSave,
}: {
  value: number;
  onSave: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <input
      value={draft}
      inputMode="numeric"
      onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
      onBlur={() => {
        const n = parseInt(draft, 10);
        if (!isNaN(n) && n !== value) onSave(n);
        else setDraft(String(value));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="w-14 rounded border border-slate-200 px-1 py-0.5 text-right text-sm outline-none focus:border-brand"
    />
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-full flex-col items-center justify-center p-6 text-center">
      {children}
    </main>
  );
}
