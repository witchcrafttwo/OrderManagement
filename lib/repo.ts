import { execute, query, queryOne, transaction } from "@/lib/db";
import type {
  MenuItem,
  OptionNode,
  OptionNodeType,
  Order,
  OrderStatus,
  OrderWithItems,
  Room,
  WaitBoard,
  WaitQueueEntry,
  WaitReadyEntry,
} from "@/lib/types";

/**
 * PostgreSQL に対する問い合わせをまとめた層。
 * サーバー側(API Route / Server Component)専用。
 *
 * 部屋をまたいだ操作を防ぐため、メニュー・オプション・注文の
 * 更新系はすべて room_id を条件に含めている。
 */

/** 部屋コードの表記を揃える(前後の空白を除去し大文字化) */
export function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase();
}

// =============================================================
// rooms
// =============================================================

export async function findRoomByCode(code: string): Promise<Room | null> {
  return queryOne<Room>(
    `select id, code, name, created_at
       from public.rooms
      where code = $1`,
    [normalizeRoomCode(code)]
  );
}

export async function createRoom(code: string, name: string): Promise<Room> {
  const room = await queryOne<Room>(
    `insert into public.rooms (code, name)
     values ($1, $2)
     returning id, code, name, created_at`,
    [normalizeRoomCode(code), name]
  );
  // insert ... returning は必ず1行返る
  return room as Room;
}

export async function deleteRoomById(id: string): Promise<boolean> {
  return (await execute(`delete from public.rooms where id = $1`, [id])) > 0;
}

export interface RoomStatsRow {
  id: string;
  code: string;
  name: string;
  created_at: string;
  orderCount: number;
  doneCount: number;
  sales: number;
}

/** 管理画面用: 部屋一覧と注文集計(SQL 側で GROUP BY する) */
export async function listRoomsWithStats(): Promise<RoomStatsRow[]> {
  return query<RoomStatsRow>(
    `select r.id,
            r.code,
            r.name,
            r.created_at,
            coalesce(s.order_count, 0)::int as "orderCount",
            coalesce(s.done_count, 0)::int  as "doneCount",
            coalesce(s.sales, 0)::int       as "sales"
       from public.rooms r
       left join (
         select room_id,
                count(*)                                        as order_count,
                count(*) filter (where status = 'done')          as done_count,
                coalesce(sum(total) filter (where status = 'done'), 0) as sales
           from public.orders
          group by room_id
       ) s on s.room_id = r.id
      order by r.created_at desc`
  );
}

// =============================================================
// menu_items
// =============================================================

const MENU_ITEM_COLUMNS = `
  id, room_id, name, price, prep_minutes, sort_order, is_active, created_at`;

export async function listMenuItems(
  roomId: string,
  options: { activeOnly?: boolean } = {}
): Promise<MenuItem[]> {
  return query<MenuItem>(
    `select ${MENU_ITEM_COLUMNS}
       from public.menu_items
      where room_id = $1
        and ($2::boolean is false or is_active)
      order by sort_order asc, created_at asc`,
    [roomId, options.activeOnly === true]
  );
}

export async function findMenuItem(
  roomId: string,
  itemId: string
): Promise<MenuItem | null> {
  return queryOne<MenuItem>(
    `select ${MENU_ITEM_COLUMNS}
       from public.menu_items
      where id = $1 and room_id = $2`,
    [itemId, roomId]
  );
}

export async function createMenuItem(
  roomId: string,
  input: { name: string; price: number; prep_minutes: number }
): Promise<MenuItem> {
  const item = await queryOne<MenuItem>(
    `insert into public.menu_items (room_id, name, price, prep_minutes, sort_order)
     values (
       $1::uuid, $2::text, $3::int, $4::int,
       coalesce((select max(sort_order) + 1 from public.menu_items where room_id = $1::uuid), 0)
     )
     returning ${MENU_ITEM_COLUMNS}`,
    [roomId, input.name, input.price, input.prep_minutes]
  );
  return item as MenuItem;
}

export async function updateMenuItem(
  roomId: string,
  itemId: string,
  patch: {
    name?: string;
    price?: number;
    prep_minutes?: number;
    is_active?: boolean;
  }
): Promise<MenuItem | null> {
  return queryOne<MenuItem>(
    `update public.menu_items
        set name         = coalesce($3, name),
            price        = coalesce($4, price),
            prep_minutes = coalesce($5, prep_minutes),
            is_active    = coalesce($6, is_active)
      where id = $1 and room_id = $2
      returning ${MENU_ITEM_COLUMNS}`,
    [
      itemId,
      roomId,
      patch.name ?? null,
      patch.price ?? null,
      patch.prep_minutes ?? null,
      patch.is_active ?? null,
    ]
  );
}

export async function deleteMenuItem(
  roomId: string,
  itemId: string
): Promise<boolean> {
  return (
    (await execute(
      `delete from public.menu_items where id = $1 and room_id = $2`,
      [itemId, roomId]
    )) > 0
  );
}

/** 並び替え: 渡された ID 順に sort_order を 0,1,2... で振り直す(1文でまとめて更新) */
export async function reorderMenuItems(
  roomId: string,
  itemIds: string[]
): Promise<number> {
  if (itemIds.length === 0) return 0;
  return execute(
    `update public.menu_items m
        set sort_order = v.ord
       from unnest($2::uuid[], $3::int[]) as v(id, ord)
      where m.id = v.id
        and m.room_id = $1
        and m.sort_order <> v.ord`,
    [roomId, itemIds, itemIds.map((_, index) => index)]
  );
}

// =============================================================
// option_nodes
// =============================================================

const OPTION_NODE_COLUMNS = `
  id, room_id, menu_item_id, parent_id, node_type,
  label, price_delta, optional, sort_order, created_at`;

/** 部屋全体のオプションノード(レジ画面はこれを一括で取る) */
export async function listOptionNodesByRoom(
  roomId: string
): Promise<OptionNode[]> {
  return query<OptionNode>(
    `select ${OPTION_NODE_COLUMNS}
       from public.option_nodes
      where room_id = $1
      order by sort_order asc, created_at asc`,
    [roomId]
  );
}

/** 1商品分のオプションノード(オプション編集画面) */
export async function listOptionNodesByItem(
  roomId: string,
  itemId: string
): Promise<OptionNode[]> {
  return query<OptionNode>(
    `select ${OPTION_NODE_COLUMNS}
       from public.option_nodes
      where room_id = $1 and menu_item_id = $2
      order by sort_order asc, created_at asc`,
    [roomId, itemId]
  );
}

export async function createOptionNode(
  roomId: string,
  itemId: string,
  input: {
    parent_id: string | null;
    node_type: OptionNodeType;
    label: string;
    sort_order: number;
  }
): Promise<OptionNode | null> {
  // 親ノードが同じ部屋・同じ商品のものかを SQL 側で確認する
  return queryOne<OptionNode>(
    `insert into public.option_nodes
       (room_id, menu_item_id, parent_id, node_type, label, sort_order)
     select $1::uuid, $2::uuid, $3::uuid, $4::text, $5::text, $6::int
      where exists (
              select 1 from public.menu_items
               where id = $2::uuid and room_id = $1::uuid
            )
        and (
              $3::uuid is null
              or exists (
                   select 1 from public.option_nodes
                    where id = $3::uuid
                      and room_id = $1::uuid
                      and menu_item_id = $2::uuid
                 )
            )
     returning ${OPTION_NODE_COLUMNS}`,
    [
      roomId,
      itemId,
      input.parent_id,
      input.node_type,
      input.label,
      input.sort_order,
    ]
  );
}

export async function updateOptionNode(
  roomId: string,
  nodeId: string,
  patch: { label?: string; price_delta?: number; optional?: boolean }
): Promise<OptionNode | null> {
  return queryOne<OptionNode>(
    `update public.option_nodes
        set label       = coalesce($3, label),
            price_delta = coalesce($4, price_delta),
            optional    = coalesce($5, optional)
      where id = $1 and room_id = $2
      returning ${OPTION_NODE_COLUMNS}`,
    [
      nodeId,
      roomId,
      patch.label ?? null,
      patch.price_delta ?? null,
      patch.optional ?? null,
    ]
  );
}

export async function deleteOptionNode(
  roomId: string,
  nodeId: string
): Promise<boolean> {
  return (
    (await execute(
      `delete from public.option_nodes where id = $1 and room_id = $2`,
      [nodeId, roomId]
    )) > 0
  );
}

// =============================================================
// orders
// =============================================================

/**
 * 注文 + 明細を1回のクエリで取る。
 * Supabase の .select("*, order_items(*)") と同じ形(order_items 配列付き)を
 * json_agg で組み立てている。
 */
const ORDER_WITH_ITEMS_FROM = `
  select o.id,
         o.room_id,
         o.ticket_no,
         o.status,
         o.total,
         o.note,
         o.created_at,
         o.started_at,
         o.completed_at,
         coalesce((
           select json_agg(
                    json_build_object(
                      'id',           i.id,
                      'order_id',     i.order_id,
                      'menu_item_id', i.menu_item_id,
                      'name',         i.name,
                      'price',        i.price,
                      'prep_minutes', i.prep_minutes,
                      'quantity',     i.quantity
                    )
                    order by i.sort_order asc, i.id asc
                  )
             from public.order_items i
            where i.order_id = o.id
         ), '[]'::json) as order_items
    from public.orders o`;

export type OrderFilter = "active" | "done" | "all";

export async function listOrders(
  roomId: string,
  filter: OrderFilter
): Promise<OrderWithItems[]> {
  if (filter === "active") {
    // 厨房: 未完成のものを古い順
    return query<OrderWithItems>(
      `${ORDER_WITH_ITEMS_FROM}
        where o.room_id = $1 and o.status <> 'done'
        order by o.created_at asc`,
      [roomId]
    );
  }
  if (filter === "done") {
    // 売上: 完成したものを新しい順
    return query<OrderWithItems>(
      `${ORDER_WITH_ITEMS_FROM}
        where o.room_id = $1 and o.status = 'done'
        order by o.completed_at desc nulls last`,
      [roomId]
    );
  }
  // CSV 書き出し: 全件を呼び出し番号順
  return query<OrderWithItems>(
    `${ORDER_WITH_ITEMS_FROM}
      where o.room_id = $1
      order by o.ticket_no asc`,
    [roomId]
  );
}

export interface NewOrderLine {
  menu_item_id: string | null;
  name: string;
  price: number;
  prep_minutes: number;
  quantity: number;
}

/**
 * 注文を作成する。注文本体と明細を1トランザクションで入れるので、
 * 途中で失敗しても明細なしの注文が残らない。
 * 合計金額は渡された明細からサーバー側で計算する。
 */
export async function createOrder(
  roomId: string,
  input: { note: string | null; lines: NewOrderLine[] }
): Promise<OrderWithItems> {
  const total = input.lines.reduce(
    (sum, line) => sum + line.price * line.quantity,
    0
  );

  return transaction(async (client) => {
    const inserted = await client.query<Order>(
      `insert into public.orders (room_id, status, total, note)
       values ($1, 'pending', $2, $3)
       returning id`,
      [roomId, total, input.note]
    );
    const orderId = inserted.rows[0].id;

    await client.query(
      `insert into public.order_items
         (order_id, menu_item_id, name, price, prep_minutes, quantity, sort_order)
       select $1, v.menu_item_id, v.name, v.price, v.prep_minutes, v.quantity, v.ord
         from unnest($2::uuid[], $3::text[], $4::int[], $5::int[], $6::int[], $7::int[])
              as v(menu_item_id, name, price, prep_minutes, quantity, ord)`,
      [
        orderId,
        input.lines.map((line) => line.menu_item_id),
        input.lines.map((line) => line.name),
        input.lines.map((line) => line.price),
        input.lines.map((line) => line.prep_minutes),
        input.lines.map((line) => line.quantity),
        input.lines.map((_, index) => index),
      ]
    );

    const result = await client.query<OrderWithItems>(
      `${ORDER_WITH_ITEMS_FROM} where o.id = $1`,
      [orderId]
    );
    return result.rows[0];
  });
}

export async function updateOrderStatus(
  roomId: string,
  orderId: string,
  status: OrderStatus
): Promise<Order | null> {
  return queryOne<Order>(
    `update public.orders
        set status = $3,
            started_at = case
                           when $3 = 'pending' then null
                           when started_at is null then now()
                           else started_at
                         end,
            completed_at = case when $3 = 'done' then now() else null end
      where id = $1 and room_id = $2
      returning id, room_id, ticket_no, status, total, note,
                created_at, started_at, completed_at`,
    [orderId, roomId, status]
  );
}

/** 営業終了リセット: その部屋の注文をすべて削除(明細は cascade) */
export async function deleteOrdersByRoom(roomId: string): Promise<number> {
  return execute(`delete from public.orders where room_id = $1`, [roomId]);
}

// =============================================================
// 待ち時間ボード
// =============================================================

/**
 * 待ち時間ボードに必要なデータを取る。
 *   queue … 未完成の注文(古い順)。製作時間は明細の合計
 *   ready … できあがった注文(新しい順、直近 readyLimit 件)
 *
 * 注文の製作時間は「明細の prep_minutes の合計」。
 * 同じ商品を複数個頼んでも1行なので1回ぶんとして数える。
 */
export async function getWaitBoard(
  roomId: string,
  readyLimit = 6
): Promise<WaitBoard> {
  const [queue, ready] = await Promise.all([
    query<WaitQueueEntry>(
      `select o.id,
              o.ticket_no,
              o.status,
              o.created_at,
              o.started_at,
              coalesce((
                select sum(i.prep_minutes)
                  from public.order_items i
                 where i.order_id = o.id
              ), 0)::int as prep_minutes
         from public.orders o
        where o.room_id = $1
          and o.status <> 'done'
        order by o.created_at asc`,
      [roomId]
    ),
    query<WaitReadyEntry>(
      `select o.id, o.ticket_no, o.completed_at
         from public.orders o
        where o.room_id = $1
          and o.status = 'done'
          and o.completed_at is not null
        order by o.completed_at desc
        limit $2`,
      [roomId, readyLimit]
    ),
  ]);

  return { queue, ready };
}
