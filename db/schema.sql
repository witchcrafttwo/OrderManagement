-- =============================================================
-- 屋台注文管理アプリ  PostgreSQL スキーマ定義
--
-- 自前サーバーの PostgreSQL に対して実行します。
--   おすすめ : npm run db:setup           (.env.local の DATABASE_URL を使って自動実行)
--   psql の場合: psql "$DATABASE_URL" -f db/schema.sql
--
-- 何度実行しても安全(冪等)です。
-- Supabase 版との違い:
--   - RLS / ポリシーは使わない(アプリが単一の DB ユーザーで接続し、
--     権限チェックは Next.js の API Route 側で行う)
--   - supabase_realtime publication の代わりに LISTEN/NOTIFY を使う
-- =============================================================

-- -------------------------------------------------------------
-- UUID 生成関数
--   PostgreSQL 13 以降は gen_random_uuid() が標準搭載。
--   12 以前のときだけ pgcrypto を有効化する(superuser 権限が必要)。
-- -------------------------------------------------------------
do $$
begin
  perform gen_random_uuid();
exception
  when undefined_function then
    create extension if not exists "pgcrypto";
end $$;

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
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.rooms(id) on delete cascade,
  name         text not null,
  price        integer not null default 0,     -- 円(整数)
  prep_minutes integer not null default 0,     -- 製作にかかる時間(分)。待ち時間の計算に使う
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

-- 既存DBから移行する場合の追加カラム
alter table public.menu_items
  add column if not exists prep_minutes integer not null default 0;

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
  started_at    timestamptz,                  -- 「作成中」にした時刻(待ち時間の計算に使う)
  completed_at  timestamptz
);

-- 既存DBから移行する場合の追加カラム
alter table public.orders
  add column if not exists started_at timestamptz;

-- -------------------------------------------------------------
-- order_items : 注文の明細
-- -------------------------------------------------------------
create table if not exists public.order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id) on delete cascade,
  menu_item_id   uuid references public.menu_items(id) on delete set null,
  name           text not null,               -- 注文時点の商品名(スナップショット)
  price          integer not null,            -- 注文時点の単価(スナップショット)
  prep_minutes   integer not null default 0,  -- 注文時点の製作時間(スナップショット)
  quantity       integer not null default 1,
  sort_order     integer not null default 0   -- 伝票に並べる順(カートの並び)
);

-- Supabase 版から移行する場合の追加カラム
alter table public.order_items
  add column if not exists sort_order integer not null default 0;
alter table public.order_items
  add column if not exists prep_minutes integer not null default 0;

-- -------------------------------------------------------------
-- option_nodes : メニューのオプション階層(ツリー)
--   商品(menu_items)に対して、選択グループ(group)と選択肢(option)を
--   親子でつないで、何層でもネストできるようにする。
--
--   例: アイスコーヒー
--        └ [group] 豆の種類 (任意)
--             ├ [option] ブレンド (+0)
--             │    └ [group] 挽き方
--             │         ├ [option] 粗挽き
--             │         └ [option] 細挽き
--             └ [option] キリマンジャロ (+50)
--
--   ルール(慣習):
--     group  の親 = null(商品直下) または option
--     option の親 = group
-- -------------------------------------------------------------
create table if not exists public.option_nodes (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.rooms(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  parent_id    uuid references public.option_nodes(id) on delete cascade,
  node_type    text not null check (node_type in ('group', 'option')),
  label        text not null,
  price_delta  integer not null default 0,     -- option の追加料金(円)
  optional     boolean not null default false, -- group: 「なし」を選べるか
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

-- -------------------------------------------------------------
-- インデックス
-- -------------------------------------------------------------
create index if not exists idx_menu_items_room on public.menu_items(room_id);
create index if not exists idx_orders_room on public.orders(room_id);
create index if not exists idx_orders_status on public.orders(room_id, status);
create index if not exists idx_order_items_order on public.order_items(order_id);
create index if not exists idx_option_nodes_item on public.option_nodes(menu_item_id);
create index if not exists idx_option_nodes_parent on public.option_nodes(parent_id);

-- 呼び出し番号は部屋の中で一意(採番の取りこぼしを DB 側でも防ぐ)
create unique index if not exists uniq_orders_room_ticket
  on public.orders(room_id, ticket_no);

-- -------------------------------------------------------------
-- 通し番号(ticket_no)を部屋ごとに自動採番するトリガー
--   同じ部屋に同時に注文が入っても番号が衝突しないよう、
--   部屋単位のアドバイザリロックを取ってから MAX+1 を求める。
--   (ロックはトランザクション終了時に自動解放)
-- -------------------------------------------------------------
create or replace function public.set_ticket_no()
returns trigger
language plpgsql
as $$
begin
  if new.ticket_no is null or new.ticket_no = 0 then
    perform pg_advisory_xact_lock(hashtextextended(new.room_id::text, 0::bigint));

    select coalesce(max(ticket_no), 0) + 1
      into new.ticket_no
      from public.orders
     where room_id = new.room_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_ticket_no on public.orders;
create trigger trg_set_ticket_no
  before insert on public.orders
  for each row execute function public.set_ticket_no();

-- -------------------------------------------------------------
-- リアルタイム通知(Supabase Realtime の置き換え)
--   orders / order_items が変化したら 'room_changes' チャンネルに
--   NOTIFY する。Next.js 側は LISTEN して SSE でブラウザへ中継する。
--   ペイロード例: {"room_id":"...","table":"orders","event":"INSERT"}
-- -------------------------------------------------------------
create or replace function public.notify_room_change()
returns trigger
language plpgsql
as $$
declare
  v_room_id  uuid;
  v_order_id uuid;
begin
  if tg_table_name = 'orders' then
    if tg_op = 'DELETE' then
      v_room_id := old.room_id;
    else
      v_room_id := new.room_id;
    end if;
  else
    if tg_op = 'DELETE' then
      v_order_id := old.order_id;
    else
      v_order_id := new.order_id;
    end if;
    -- 親の注文が cascade 削除されている場合は見つからない。
    -- その時は orders 側の通知が既に飛んでいるので何もしない。
    select o.room_id into v_room_id
      from public.orders o
     where o.id = v_order_id;
  end if;

  if v_room_id is not null then
    perform pg_notify(
      'room_changes',
      json_build_object(
        'room_id', v_room_id,
        'table', tg_table_name,
        'event', tg_op
      )::text
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_orders on public.orders;
create trigger trg_notify_orders
  after insert or update or delete on public.orders
  for each row execute function public.notify_room_change();

drop trigger if exists trg_notify_order_items on public.order_items;
create trigger trg_notify_order_items
  after insert or update or delete on public.order_items
  for each row execute function public.notify_room_change();

-- -------------------------------------------------------------
-- Supabase から移行した場合の後片付け(新規DBでは何も起きません)
--   このアプリは単一の DB ユーザーで接続し、権限チェックは
--   Next.js の API Route 側で行うため RLS は使わない。
-- -------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in ('rooms', 'menu_items', 'orders', 'order_items', 'option_nodes')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

alter table public.rooms        disable row level security;
alter table public.menu_items   disable row level security;
alter table public.orders       disable row level security;
alter table public.order_items  disable row level security;
alter table public.option_nodes disable row level security;
