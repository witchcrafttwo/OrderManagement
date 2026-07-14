-- =============================================================
-- 自動クリーンアップ設定 (任意)
-- 一定期間使われていない部屋を毎日自動削除します。
-- Supabase の SQL Editor で実行してください。
-- =============================================================

-- pg_cron 拡張を有効化 (Supabase では利用可能)
-- ※ もしエラーになる場合は、Dashboard > Database > Extensions から
--   "pg_cron" を有効化してから、この下の select 文だけ実行してください。
create extension if not exists pg_cron;

-- -------------------------------------------------------------
-- クリーンアップ関数:
--   「作成から N 日以上経過」かつ「直近 N 日以内に注文がない」部屋を削除。
--   注文・メニューは cascade で一緒に削除されます。
--   戻り値 = 削除した部屋数
-- -------------------------------------------------------------
create or replace function public.cleanup_old_rooms(days integer default 30)
returns integer as $$
declare
  deleted_count integer;
begin
  with old_rooms as (
    select r.id
      from public.rooms r
     where r.created_at < now() - make_interval(days => days)
       and not exists (
         select 1
           from public.orders o
          where o.room_id = r.id
            and o.created_at > now() - make_interval(days => days)
       )
  )
  delete from public.rooms
   where id in (select id from old_rooms);

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$ language plpgsql;

-- -------------------------------------------------------------
-- 毎日 午前3時(UTC) にクリーンアップを実行するようスケジュール登録
--   ※ Supabase の cron は UTC 基準です(JST では正午頃)。
--   既存の同名ジョブがあれば入れ替えます。
-- -------------------------------------------------------------
select cron.unschedule('cleanup-old-rooms')
  where exists (select 1 from cron.job where jobname = 'cleanup-old-rooms');

select cron.schedule(
  'cleanup-old-rooms',
  '0 3 * * *',
  $$ select public.cleanup_old_rooms(30); $$
);

-- -------------------------------------------------------------
-- 参考コマンド
-- -------------------------------------------------------------
-- 登録済みジョブの確認:
--   select * from cron.job;
-- 自動削除を止めたいとき:
--   select cron.unschedule('cleanup-old-rooms');
-- 手動で今すぐ実行してみる(削除された部屋数が返る):
--   select public.cleanup_old_rooms(30);
