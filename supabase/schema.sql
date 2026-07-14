-- =============================================================
-- 屋台注文管理アプリ  スキーマ定義
-- Supabase の SQL Editor に貼り付けて実行してください
-- =============================================================

-- 拡張機能(UUID生成用)
create extension if not exists "pgcrypto";

-- -------------------------------------------------------------
-- rooms : 出店ごとの「部屋」
-- -------------------------------------------------------------
create table if not exists public.rooms (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,           -- 参加用コード(例: ABC123)
  name        text not null,                  -- 出店名
  created_at  timestamptz not null default now()
);

-- -------------------------------------------------------------
-- menu_items : 部屋ごとのメニュー(その場で編集可能)
-- -------------------------------------------------------------
create table if not exists public.menu_items (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms(id) on delete cascade,
  name        text not null,
  price       integer not null default 0,     -- 円(整数)
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- -------------------------------------------------------------
-- orders : 注文(1回の注文 = 1レコード)
--   status: 'pending'(未着手) / 'preparing'(作成中) / 'done'(完成)
-- -------------------------------------------------------------
create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.rooms(id) on delete cascade,
  ticket_no     integer not null,             -- 部屋ごとの通し番号(呼び出し番号)
  status        text not null default 'pending',
  total         integer not null default 0,   -- 合計金額(円)
  note          text,                         -- 備考(トッピング等)
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

-- -------------------------------------------------------------
-- order_items : 注文の明細
-- -------------------------------------------------------------
create table if not exists public.order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id) on delete cascade,
  menu_item_id   uuid references public.menu_items(id) on delete set null,
  name           text not null,               -- 注文時点の商品名(スナップショット)
  price          integer not null,            -- 注文時点の単価(スナップショット)
  quantity       integer not null default 1
);

-- インデックス
create index if not exists idx_menu_items_room on public.menu_items(room_id);
create index if not exists idx_orders_room on public.orders(room_id);
create index if not exists idx_orders_status on public.orders(room_id, status);
create index if not exists idx_order_items_order on public.order_items(order_id);

-- -------------------------------------------------------------
-- 通し番号(ticket_no)を部屋ごとに自動採番するトリガー
-- -------------------------------------------------------------
create or replace function public.set_ticket_no()
returns trigger as $$
begin
  if new.ticket_no is null or new.ticket_no = 0 then
    select coalesce(max(ticket_no), 0) + 1
      into new.ticket_no
      from public.orders
     where room_id = new.room_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_ticket_no on public.orders;
create trigger trg_set_ticket_no
  before insert on public.orders
  for each row execute function public.set_ticket_no();

-- -------------------------------------------------------------
-- Realtime を有効化
-- -------------------------------------------------------------
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_items;
alter publication supabase_realtime add table public.menu_items;

-- -------------------------------------------------------------
-- Row Level Security
--   MVP: 認証なし。部屋コードを知っている人が anon キーで読み書きする方式。
--   すべての行に対して anon の読み書きを許可します。
--   ※ 本番で厳密な権限管理が必要な場合は Supabase Auth を導入し、
--     ここを room 所有者ベースのポリシーに置き換えてください。
-- -------------------------------------------------------------
alter table public.rooms       enable row level security;
alter table public.menu_items  enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

-- rooms
drop policy if exists "anon all rooms" on public.rooms;
create policy "anon all rooms" on public.rooms
  for all using (true) with check (true);

-- menu_items
drop policy if exists "anon all menu_items" on public.menu_items;
create policy "anon all menu_items" on public.menu_items
  for all using (true) with check (true);

-- orders
drop policy if exists "anon all orders" on public.orders;
create policy "anon all orders" on public.orders
  for all using (true) with check (true);

-- order_items
drop policy if exists "anon all order_items" on public.order_items;
create policy "anon all order_items" on public.order_items
  for all using (true) with check (true);
