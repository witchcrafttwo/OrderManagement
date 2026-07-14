import type {
  MenuItem,
  OptionNode,
  SelectedOption,
} from "@/lib/types";

export const NONE_CHOICE = "__none__";

export interface OptionTreeNode extends OptionNode {
  children: OptionTreeNode[];
}

/**
 * フラットな option_nodes から、指定商品のツリー(トップレベルgroupの配列)を組み立てる。
 * children は sort_order 順。
 */
export function buildOptionForest(
  nodes: OptionNode[],
  menuItemId: string
): OptionTreeNode[] {
  const own = nodes
    .filter((n) => n.menu_item_id === menuItemId)
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));

  const map = new Map<string, OptionTreeNode>();
  own.forEach((n) => map.set(n.id, { ...n, children: [] }));

  const roots: OptionTreeNode[] = [];
  own.forEach((n) => {
    const node = map.get(n.id)!;
    if (n.parent_id && map.has(n.parent_id)) {
      map.get(n.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots; // トップレベルの group 群
}

/** その商品にオプションが設定されているか */
export function hasOptions(nodes: OptionNode[], menuItemId: string): boolean {
  return nodes.some((n) => n.menu_item_id === menuItemId);
}

export type Selections = Record<string, string | undefined>; // groupId -> optionId | NONE_CHOICE

/**
 * 現在の選択状態に応じて「表示すべき group」を上から順に集める。
 * ある group で option が選ばれ、その option が子 group を持つ場合、それらも表示対象になる。
 */
export function collectVisibleGroups(
  roots: OptionTreeNode[],
  selections: Selections
): OptionTreeNode[] {
  const result: OptionTreeNode[] = [];
  const walk = (groups: OptionTreeNode[]) => {
    for (const g of groups) {
      result.push(g);
      const sel = selections[g.id];
      if (sel && sel !== NONE_CHOICE) {
        const opt = g.children.find((o) => o.id === sel);
        if (opt) walk(opt.children); // option の子は group
      }
    }
  };
  walk(roots);
  return result;
}

/** 表示中の全 group に有効な選択があるか(必須groupは「なし」不可) */
export function isSelectionComplete(
  roots: OptionTreeNode[],
  selections: Selections
): boolean {
  const visible = collectVisibleGroups(roots, selections);
  return visible.every((g) => {
    const sel = selections[g.id];
    if (!sel) return false;
    if (!g.optional && sel === NONE_CHOICE) return false;
    return true;
  });
}

/** 選択結果を、表示順どおりの SelectedOption 配列に変換 */
export function resolveSelectedOptions(
  roots: OptionTreeNode[],
  selections: Selections
): SelectedOption[] {
  const visible = collectVisibleGroups(roots, selections);
  const out: SelectedOption[] = [];
  for (const g of visible) {
    const sel = selections[g.id];
    if (!sel || sel === NONE_CHOICE) continue;
    const opt = g.children.find((o) => o.id === sel);
    if (!opt) continue;
    out.push({
      groupId: g.id,
      groupLabel: g.label,
      optionId: opt.id,
      optionLabel: opt.label,
      priceDelta: opt.price_delta,
    });
  }
  return out;
}

/** カート項目の表示名・単価・キーを組み立てる */
export function composeCartLine(
  menuItem: MenuItem,
  options: SelectedOption[]
): { key: string; displayName: string; unitPrice: number } {
  const unitPrice =
    menuItem.price + options.reduce((s, o) => s + o.priceDelta, 0);
  const displayName =
    options.length === 0
      ? menuItem.name
      : `${menuItem.name}（${options.map((o) => o.optionLabel).join("・")}）`;
  const key =
    menuItem.id +
    ":" +
    options.map((o) => o.optionId).join(",");
  return { key, displayName, unitPrice };
}
