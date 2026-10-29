"use client";

import { useState } from "react";
import { yen } from "@/lib/format";
import {
  NONE_CHOICE,
  collectVisibleGroups,
  isSelectionComplete,
  resolveSelectedOptions,
  type OptionTreeNode,
  type Selections,
} from "@/lib/options";
import type { MenuItem, SelectedOption } from "@/lib/types";

export function OrderOptionModal({
  item,
  roots,
  onConfirm,
  onClose,
}: {
  item: MenuItem;
  roots: OptionTreeNode[];
  onConfirm: (options: SelectedOption[]) => void;
  onClose: () => void;
}) {
  const [selections, setSelections] = useState<Selections>({});

  const visible = collectVisibleGroups(roots, selections);
  const complete = isSelectionComplete(roots, selections);
  const selected = resolveSelectedOptions(roots, selections);
  const price = item.price + selected.reduce((s, o) => s + o.priceDelta, 0);

  function pick(groupId: string, optionId: string) {
    setSelections((prev) => ({ ...prev, [groupId]: optionId }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{item.name}</h2>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-full text-xl text-slate-400 active:bg-slate-100"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          {visible.map((group) => {
            const sel = selections[group.id];
            return (
              <div key={group.id}>
                <p className="mb-2 text-sm font-bold">
                  {group.label}
                  {group.optional ? (
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      (任意)
                    </span>
                  ) : (
                    <span className="ml-2 text-xs font-normal text-red-400">
                      必須
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  {group.children.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => pick(group.id, opt.id)}
                      className={`rounded-full border px-4 py-2 text-sm font-bold ${
                        sel === opt.id
                          ? "border-brand bg-brand text-white"
                          : "border-slate-300 bg-white text-slate-700"
                      }`}
                    >
                      {opt.label}
                      {opt.price_delta > 0 && (
                        <span className="ml-1 text-xs opacity-80">
                          +{yen(opt.price_delta)}
                        </span>
                      )}
                    </button>
                  ))}
                  {group.optional && (
                    <button
                      onClick={() => pick(group.id, NONE_CHOICE)}
                      className={`rounded-full border px-4 py-2 text-sm font-bold ${
                        sel === NONE_CHOICE
                          ? "border-slate-500 bg-slate-500 text-white"
                          : "border-slate-300 bg-white text-slate-500"
                      }`}
                    >
                      なし
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex items-center gap-3 border-t pt-4">
          <span className="flex-1 text-lg font-bold">{yen(price)}</span>
          <button
            onClick={() => onConfirm(selected)}
            disabled={!complete}
            className="rounded-xl bg-brand px-6 py-3 font-bold text-white active:bg-brand-dark disabled:opacity-40"
          >
            カートに追加
          </button>
        </div>
      </div>
    </div>
  );
}
