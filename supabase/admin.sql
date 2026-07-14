-- =============================================================
-- 管理者機能用の RLS 更新
-- 「部屋の作成・更新・削除は管理者(サーバー経由)だけ」に制限します。
-- 一般ユーザー(anonキー)は部屋を「参加のため読む」ことだけ可能。
-- Supabase の SQL Editor で実行してください。
-- =============================================================

-- rooms: これまでの「anonが何でもできる」ポリシーを削除
drop policy if exists "anon all rooms" on public.rooms;

-- rooms: 参加(コード照合)のための SELECT だけ anon に許可
drop policy if exists "public read rooms" on public.rooms;
create policy "public read rooms" on public.rooms
  for select using (true);

-- ※ INSERT / UPDATE / DELETE のポリシーは作らない
--   → anon からの部屋の作成・変更・削除は拒否される。
--   → 管理者はサーバー側で service_role キーを使うため RLS を回避して実行できる。

-- menu_items / orders / order_items は従来どおり
--   (屋台スタッフの端末が anon キーで読み書きできる状態を維持)
-- 変更不要。schema.sql の "anon all ..." ポリシーがそのまま有効です。
