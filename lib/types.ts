export type OrderStatus = "pending" | "preparing" | "done";

export interface Room {
  id: string;
  code: string;
  name: string;
  created_at: string;
}

export interface MenuItem {
  id: string;
  room_id: string;
  name: string;
  price: number;
  /** 製作にかかる時間(分)。待ち時間の計算に使う。0 なら待ち時間に加算しない */
  prep_minutes: number;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  name: string;
  price: number;
  /** 注文時点の製作時間(分)のスナップショット */
  prep_minutes: number;
  quantity: number;
}

export interface Order {
  id: string;
  room_id: string;
  ticket_no: number;
  status: OrderStatus;
  total: number;
  note: string | null;
  created_at: string;
  /** 「作成中」にした時刻。まだ着手していなければ null */
  started_at: string | null;
  completed_at: string | null;
}

export interface OrderWithItems extends Order {
  order_items: OrderItem[];
}

export type OptionNodeType = "group" | "option";

export interface OptionNode {
  id: string;
  room_id: string;
  menu_item_id: string;
  parent_id: string | null;
  node_type: OptionNodeType;
  label: string;
  price_delta: number;
  optional: boolean;
  sort_order: number;
  created_at: string;
}

/** 待ち時間ボード用: 行列に並んでいる注文1件 */
export interface WaitQueueEntry {
  id: string;
  ticket_no: number;
  status: OrderStatus;
  created_at: string;
  started_at: string | null;
  /** この注文の製作時間の合計(分) */
  prep_minutes: number;
}

/** 待ち時間ボード用: できあがって呼び出し中の注文1件 */
export interface WaitReadyEntry {
  id: string;
  ticket_no: number;
  completed_at: string;
}

/** 待ち時間ボードが必要とするデータ一式 */
export interface WaitBoard {
  queue: WaitQueueEntry[];
  ready: WaitReadyEntry[];
}

/**
 * 部屋の変更通知(Supabase Realtime の置き換え)。
 * PostgreSQL の NOTIFY → SSE で流れてくる。
 */
export interface RoomChange {
  room_id: string;
  /** 'orders' | 'order_items'、再同期のときは 'all' */
  table: string;
  /** 'INSERT' | 'UPDATE' | 'DELETE'、接続を張り直したときは 'RESYNC' */
  event: string;
}

/** レジで選択されたオプション1件 */
export interface SelectedOption {
  groupId: string;
  groupLabel: string;
  optionId: string;
  optionLabel: string;
  priceDelta: number;
}

/** レジ画面のカート項目 */
export interface CartLine {
  key: string; // 商品ID + 選択オプションで一意になるキー
  menuItem: MenuItem;
  options: SelectedOption[];
  displayName: string; // 例: アイスコーヒー（ブレンド・粗挽き）
  unitPrice: number; // 基本料金 + オプション追加料金
  quantity: number;
}
