-- =============================================================
-- 自動クリーンアップ設定 (任意)
-- 一定期間使われていない部屋を自動削除します。
--
--   npm run db:setup    で schema.sql と一緒に実行されます
--   psql "$DATABASE_URL" -f db/cleanup.sql
-- =============================================================

-- -------------------------------------------------------------
-- クリーンアップ関数:
--   「作成から N 日以上経過」かつ「直近 N 日以内に注文がない」部屋を削除。
--   注文・メニュー・オプションは cascade で一緒に削除されます。
--   戻り値 = 削除した部屋数
-- -------------------------------------------------------------
create or replace function public.cleanup_old_rooms(days integer default 30)
returns integer
language plpgsql
as $$
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
$$;

-- -------------------------------------------------------------
-- 定期実行の登録
--   pg_cron が使える環境なら毎日 3:00 に実行するよう登録します。
--   使えない場合は何もしません(エラーにはなりません)。
--   その場合は OS 側のスケジューラから実行してください:
--     Linux  (crontab): 0 3 * * * cd /path/to/app && npm run db:cleanup
--     Windows(タスクスケジューラ): npm run db:cleanup を毎日実行
-- -------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron が見つかりません。定期実行は OS のスケジューラから "npm run db:cleanup" を呼んでください。';
    return;
  end if;

  begin
    execute 'create extension if not exists pg_cron';
  exception when others then
    raise notice 'pg_cron の有効化に失敗しました (%)。OS のスケジューラをご利用ください。', sqlerrm;
    return;
  end;

  begin
    execute $q$
      select cron.unschedule('cleanup-old-rooms')
        where exists (select 1 from cron.job where jobname = 'cleanup-old-rooms')
    $q$;
    execute $q$
      select cron.schedule(
        'cleanup-old-rooms',
        '0 3 * * *',
        'select public.cleanup_old_rooms(30);'
      )
    $q$;
    raise notice 'pg_cron に cleanup-old-rooms を登録しました(毎日 3:00)。';
  exception when others then
    raise notice 'cron ジョブの登録に失敗しました (%)。OS のスケジューラをご利用ください。', sqlerrm;
  end;
end $$;

-- -------------------------------------------------------------
-- 参考コマンド
-- -------------------------------------------------------------
-- 登録済みジョブの確認 : select * from cron.job;
-- 自動削除を止める     : select cron.unschedule('cleanup-old-rooms');
-- 手動で今すぐ実行     : select public.cleanup_old_rooms(30);
