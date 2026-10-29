import type { OrderWithItems } from "@/lib/types";

/**
 * 厨房画面の「いま何が何点たまっているか」の集計(純関数)。
 *
 * 集計のキーは注文明細の名前(オプション込みの表示名)。
 * 「たこ焼き(ソース)」と「たこ焼き(しお)」は作り方が違うので分けて数える。
 */

export interface PendingItemRow {
  /** 注文時点の表示名(オプション込み) */
  name: string;
  /** 未完成の注文に入っている合計個数 */
  total: number;
  /** そのうち未着手ぶん */
  pending: number;
  /** そのうち作成中ぶん */
  preparing: number;
}

export interface KitchenSummary {
  /** 多い順(同数なら名前順) */
  rows: PendingItemRow[];
  /** 未完成の商品の合計点数 */
  totalItems: number;
  /** 未着手の注文数 */
  pendingOrders: number;
  /** 作成中の注文数 */
  preparingOrders: number;
}

export function summarizeOrders(orders: OrderWithItems[]): KitchenSummary {
  const rows = new Map<string, PendingItemRow>();
  let totalItems = 0;
  let pendingOrders = 0;
  let preparingOrders = 0;

  for (const order of orders) {
    const isPreparing = order.status === "preparing";
    if (isPreparing) preparingOrders += 1;
    else pendingOrders += 1;

    for (const item of order.order_items) {
      const row = rows.get(item.name) ?? {
        name: item.name,
        total: 0,
        pending: 0,
        preparing: 0,
      };
      row.total += item.quantity;
      if (isPreparing) row.preparing += item.quantity;
      else row.pending += item.quantity;
      rows.set(item.name, row);
      totalItems += item.quantity;
    }
  }

  return {
    rows: [...rows.values()].sort(
      (a, b) => b.total - a.total || a.name.localeCompare(b.name, "ja")
    ),
    totalItems,
    pendingOrders,
    preparingOrders,
  };
}
