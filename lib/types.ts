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

/** レジ画面のカート項目 */
export interface CartLine {
  menuItem: MenuItem;
  quantity: number;
}
