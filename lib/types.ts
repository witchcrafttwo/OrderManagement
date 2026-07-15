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
  sort_order: number;
  is_active: boolean;
  size: number; // 1=小, 2=中, 3=大(レジ表示サイズ)
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  name: string;
  price: number;
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
