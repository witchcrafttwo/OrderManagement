-- =============================================================
-- メニューのオプション階層(ツリー)
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
--
-- Supabase の SQL Editor で実行してください。
-- =============================================================

create table if not exists public.option_nodes (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.rooms(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  parent_id    uuid references public.option_nodes(id) on delete cascade,
  node_type    text not null check (node_type in ('group', 'option')),
  label        text not null,
  price_delta  integer not null default 0,   -- option の追加料金(円)
  optional     boolean not null default false, -- group: 「なし」を選べるか
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists idx_option_nodes_item on public.option_nodes(menu_item_id);
create index if not exists idx_option_nodes_parent on public.option_nodes(parent_id);

-- Realtime
alter publication supabase_realtime add table public.option_nodes;

-- RLS(menu_items と同じく anon 読み書き可)
alter table public.option_nodes enable row level security;
drop policy if exists "anon all option_nodes" on public.option_nodes;
create policy "anon all option_nodes" on public.option_nodes
  for all using (true) with check (true);
