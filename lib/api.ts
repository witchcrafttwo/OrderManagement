import type {
  MenuItem,
  OptionNode,
  OptionNodeType,
  Order,
  OrderStatus,
  OrderWithItems,
  Room,
  WaitBoard,
} from "@/lib/types";

/**
 * ブラウザから API Route を呼ぶための薄いラッパー。
 * DB への接続はすべてサーバー側(app/api/rooms/...)で行うので、
 * ブラウザは部屋コードしか知らなくてよい。
 */

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("サーバーに接続できませんでした", 0);
  }

  const data: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : `通信に失敗しました (${res.status})`;
    throw new ApiError(message, res.status);
  }

  return data as T;
}

const roomPath = (code: string) => `/api/rooms/${encodeURIComponent(code)}`;

export const roomApi = {
  /** 部屋コードから部屋情報を取得 */
  async get(code: string): Promise<Room> {
    const { room } = await request<{ room: Room }>("GET", roomPath(code));
    return room;
  },

  /** 部屋を完全に削除(確認のため部屋コードの再入力が必要) */
  async remove(code: string, confirmCode: string): Promise<void> {
    await request("DELETE", roomPath(code), { confirmCode });
  },

  // ---------------- メニュー ----------------

  /** メニュー一覧(必要ならオプションノードも一緒に) */
  async menu(
    code: string,
    options: { activeOnly?: boolean; withOptions?: boolean } = {}
  ): Promise<{ items: MenuItem[]; optionNodes: OptionNode[] }> {
    const params = new URLSearchParams();
    if (options.activeOnly) params.set("activeOnly", "1");
    if (options.withOptions) params.set("withOptions", "1");
    const queryString = params.toString();
    const suffix = queryString ? `?${queryString}` : "";

    const data = await request<{ items: MenuItem[]; optionNodes?: OptionNode[] }>(
      "GET",
      `${roomPath(code)}/menu${suffix}`
    );
    return { items: data.items, optionNodes: data.optionNodes ?? [] };
  },

  async addMenuItem(
    code: string,
    input: { name: string; price: number; prep_minutes: number }
  ): Promise<MenuItem> {
    const { item } = await request<{ item: MenuItem }>(
      "POST",
      `${roomPath(code)}/menu`,
      input
    );
    return item;
  },

  async updateMenuItem(
    code: string,
    itemId: string,
    patch: {
      name?: string;
      price?: number;
      prep_minutes?: number;
      is_active?: boolean;
    }
  ): Promise<MenuItem> {
    const { item } = await request<{ item: MenuItem }>(
      "PATCH",
      `${roomPath(code)}/menu/${itemId}`,
      patch
    );
    return item;
  },

  async deleteMenuItem(code: string, itemId: string): Promise<void> {
    await request("DELETE", `${roomPath(code)}/menu/${itemId}`);
  },

  /** 並び替え: 表示順の ID 配列を渡す */
  async reorderMenu(code: string, itemIds: string[]): Promise<void> {
    await request("PATCH", `${roomPath(code)}/menu`, { itemIds });
  },

  // ---------------- オプション ----------------

  /** 商品1件 + そのオプションツリー */
  async menuItem(
    code: string,
    itemId: string
  ): Promise<{ item: MenuItem; optionNodes: OptionNode[] }> {
    return request<{ item: MenuItem; optionNodes: OptionNode[] }>(
      "GET",
      `${roomPath(code)}/menu/${itemId}`
    );
  },

  async addOptionNode(
    code: string,
    itemId: string,
    input: {
      parent_id: string | null;
      node_type: OptionNodeType;
      label?: string;
      sort_order?: number;
    }
  ): Promise<OptionNode> {
    const { node } = await request<{ node: OptionNode }>(
      "POST",
      `${roomPath(code)}/menu/${itemId}/options`,
      input
    );
    return node;
  },

  async updateOptionNode(
    code: string,
    itemId: string,
    nodeId: string,
    patch: { label?: string; price_delta?: number; optional?: boolean }
  ): Promise<OptionNode> {
    const { node } = await request<{ node: OptionNode }>(
      "PATCH",
      `${roomPath(code)}/menu/${itemId}/options/${nodeId}`,
      patch
    );
    return node;
  },

  async deleteOptionNode(
    code: string,
    itemId: string,
    nodeId: string
  ): Promise<void> {
    await request("DELETE", `${roomPath(code)}/menu/${itemId}/options/${nodeId}`);
  },

  // ---------------- 注文 ----------------

  /** active = 未完成(厨房) / done = 完成(売上) / all = 全件(CSV) */
  async orders(
    code: string,
    filter: "active" | "done" | "all"
  ): Promise<OrderWithItems[]> {
    const { orders } = await request<{ orders: OrderWithItems[] }>(
      "GET",
      `${roomPath(code)}/orders?filter=${filter}`
    );
    return orders;
  },

  async createOrder(
    code: string,
    input: {
      note: string | null;
      lines: {
        menu_item_id: string | null;
        name: string;
        price: number;
        prep_minutes: number;
        quantity: number;
      }[];
    }
  ): Promise<OrderWithItems> {
    const { order } = await request<{ order: OrderWithItems }>(
      "POST",
      `${roomPath(code)}/orders`,
      input
    );
    return order;
  },

  async setOrderStatus(
    code: string,
    orderId: string,
    status: OrderStatus
  ): Promise<Order> {
    const { order } = await request<{ order: Order }>(
      "PATCH",
      `${roomPath(code)}/orders/${orderId}`,
      { status }
    );
    return order;
  },

  /** 営業終了リセット: この部屋の注文をすべて削除 */
  async clearOrders(code: string): Promise<number> {
    const { deleted } = await request<{ deleted: number }>(
      "DELETE",
      `${roomPath(code)}/orders`
    );
    return deleted;
  },

  // ---------------- 待ち時間 ----------------

  /** 待ち時間ボード用のデータ(行列 + できあがり) */
  async waitBoard(code: string): Promise<WaitBoard> {
    return request<WaitBoard>("GET", `${roomPath(code)}/wait`);
  },
};

/** エラーを画面に出すためのメッセージに変換する */
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
