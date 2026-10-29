"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { roomApi } from "@/lib/api";
import { useRoom } from "@/lib/useRoom";
import { useRoomStream } from "@/lib/useRoomStream";
import { minutesLabel, waitLabel } from "@/lib/format";
import {
  DEFAULT_LANES,
  LANE_CHOICES,
  estimateWait,
  type QueueEstimate,
} from "@/lib/wait";
import type { WaitBoard } from "@/lib/types";

/** 表示を更新する間隔(ミリ秒) */
const TICK_MS = 15_000;
/** 「お渡しできます」に出しておく時間(分) */
const READY_WINDOW_MINUTES = 20;
/** 「お渡しできます」に並べる最大件数 */
const READY_LIMIT = 4;

const EMPTY_BOARD: WaitBoard = { queue: [], ready: [] };

/**
 * 画面の大きさと向きに合わせて字の大きさを変える。
 * 縦画面は幅、横画面は高さと幅の小さいほうを基準にする。
 */
const SIZE = {
  /** 待ち時間の数字 */
  hero: "text-[clamp(3.25rem,19vw,8rem)] landscape:text-[clamp(2.75rem,min(10vw,17vh),9rem)]",
  /** 待ち時間が「待ちなし」のとき(文字が長いので少し小さめ) */
  heroText:
    "text-[clamp(2.25rem,12vw,5rem)] landscape:text-[clamp(1.75rem,min(6vw,11vh),5.5rem)]",
  /** お渡しできる番号(先頭) */
  readyLead:
    "text-[clamp(2.25rem,11vw,4.5rem)] landscape:text-[clamp(2rem,min(7vw,12vh),6rem)]",
  /** お渡しできる番号(2件目以降) */
  readySub:
    "text-[clamp(1.5rem,7vw,2.75rem)] landscape:text-[clamp(1.25rem,min(4vw,7vh),3.5rem)]",
  /** 行列の番号 */
  ticket:
    "text-[clamp(1.75rem,8vw,3rem)] landscape:text-[clamp(1.5rem,min(5vw,8vh),3.5rem)]",
} as const;

export default function WaitPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const { room, loading, error } = useRoom(code);
  const [board, setBoard] = useState<WaitBoard>(EMPTY_BOARD);
  const [now, setNow] = useState(() => Date.now());
  const [lanes, setLanes] = useState(DEFAULT_LANES);
  const [showSettings, setShowSettings] = useState(false);

  // 端末ごとの「同時に作れる注文数」を復元
  useEffect(() => {
    const saved = Number(localStorage.getItem("wait_lanes"));
    if (LANE_CHOICES.includes(saved as (typeof LANE_CHOICES)[number])) {
      setLanes(saved);
    }
  }, []);

  function changeLanes(value: number) {
    setLanes(value);
    localStorage.setItem("wait_lanes", String(value));
  }

  const load = useCallback(async () => {
    try {
      setBoard(await roomApi.waitBoard(code));
    } catch (err) {
      console.error("[wait] 待ち時間の取得に失敗しました:", err);
    }
  }, [code]);

  useEffect(() => {
    if (room) load();
  }, [room, load]);

  // 注文の増減はサーバーからの通知で拾う
  useRoomStream(room ? code : null, load);

  // 経過時間を反映するため定期的に再計算する
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const estimate = useMemo(
    () => estimateWait(board.queue, lanes, now),
    [board.queue, lanes, now]
  );

  const ready = useMemo(
    () =>
      board.ready
        .filter(
          (r) =>
            now - new Date(r.completed_at).getTime() <
            READY_WINDOW_MINUTES * 60_000
        )
        .slice(0, READY_LIMIT),
    [board.ready, now]
  );

  if (loading) return <Center>読み込み中...</Center>;
  if (error || !room)
    return (
      <Center>
        <p className="mb-4 text-red-600">{error ?? "部屋が見つかりません"}</p>
        <Link href="/" className="font-bold text-brand underline">
          ホームに戻る
        </Link>
      </Center>
    );

  const isEmpty = estimate.entries.length === 0 && ready.length === 0;

  return (
    // 画面ぴったりに収め、はみ出す行列だけを中でスクロールさせる
    <div className="relative flex h-dvh w-full flex-col overflow-hidden">
      <FloatingControls
        roomCode={room.code}
        showSettings={showSettings}
        onToggleSettings={() => setShowSettings((v) => !v)}
      />

      {showSettings && (
        <SettingsPanel
          lanes={lanes}
          onChangeLanes={changeLanes}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* 縦画面は上下、横画面は左右に分ける */}
      <main className="flex min-h-0 flex-1 flex-col landscape:flex-row">
        {/* 待ち時間 */}
        <section className="flex shrink-0 flex-col items-center justify-center bg-white px-4 py-5 text-center landscape:w-[38%] landscape:border-r landscape:py-4">
          <p className="truncate text-xs font-bold text-slate-400 sm:text-sm">
            {room.name}
          </p>
          <p className="mt-1 text-xs font-bold tracking-widest text-slate-400 sm:text-sm">
            ただいまの待ち時間
          </p>
          {estimate.totalWaitMinutes === 0 ? (
            <p
              className={`mt-1 font-bold leading-none text-brand ${SIZE.heroText}`}
            >
              待ちなし
            </p>
          ) : (
            <p
              className={`mt-1 font-bold leading-none text-brand ${SIZE.hero}`}
            >
              {minutesLabel(estimate.totalWaitMinutes)}
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500 sm:text-sm">
            {estimate.entries.length === 0
              ? "すぐにお作りできます"
              : `お待ちの注文 ${estimate.entries.length}件`}
          </p>
          <p className="mt-0.5 text-[0.65rem] text-slate-400 sm:text-xs">
            ご注文の内容により前後します
          </p>
        </section>

        {/* 番号の一覧(多いときはここだけスクロール) */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 sm:p-4">
          {ready.length > 0 && (
            <section className="shrink-0 rounded-2xl bg-emerald-50 p-3 text-center sm:p-4">
              <p className="text-xs font-bold text-emerald-700 sm:text-sm">
                🔔 お渡しできます
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                {ready.map((r, index) => (
                  <span
                    key={r.id}
                    className={`rounded-xl bg-white px-3 py-1 font-bold leading-none text-emerald-700 shadow-sm sm:px-4 sm:py-2 ${
                      index === 0
                        ? SIZE.readyLead
                        : `${SIZE.readySub} opacity-70`
                    }`}
                  >
                    #{r.ticket_no}
                  </span>
                ))}
              </div>
            </section>
          )}

          {estimate.preparing.length > 0 && (
            <TicketSection
              title="🍳 お作りしています"
              tone="amber"
              entries={estimate.preparing}
              etaText={(e) =>
                e.remainingMinutes > 0
                  ? `あと${minutesLabel(e.remainingMinutes)}`
                  : "もうすぐ"
              }
            />
          )}

          {estimate.pending.length > 0 && (
            <TicketSection
              title="⏳ お待ちいただいています"
              tone="slate"
              entries={estimate.pending}
              etaText={(e) =>
                e.etaMinutes > 0 ? `${waitLabel(e.etaMinutes)}後` : "もうすぐ"
              }
            />
          )}

          {isEmpty && (
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm">
              <p className="text-5xl sm:text-6xl">🍢</p>
              <p className="mt-3 text-sm sm:text-base">
                ご注文をお待ちしています
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/** 戻る・全画面・設定。お客さんの邪魔にならないよう隅に薄く置く */
function FloatingControls({
  roomCode,
  showSettings,
  onToggleSettings,
}: {
  roomCode: string;
  showSettings: boolean;
  onToggleSettings: () => void;
}) {
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    setCanFullscreen(
      typeof document.documentElement.requestFullscreen === "function" &&
        document.fullscreenEnabled
    );
    const sync = () => setIsFullscreen(document.fullscreenElement !== null);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      /* 対応していない端末では何もしない */
    }
  }

  const buttonClass =
    "flex h-9 w-9 items-center justify-center rounded-full bg-white/70 text-slate-400 backdrop-blur active:bg-white";

  return (
    <>
      <Link
        href={`/room/${roomCode}`}
        className={`absolute left-2 top-2 z-20 text-xl ${buttonClass}`}
        aria-label="部屋メニューへ戻る"
      >
        ‹
      </Link>
      <div className="absolute right-2 top-2 z-20 flex gap-1">
        {canFullscreen && (
          <button
            onClick={toggleFullscreen}
            className={buttonClass}
            aria-label={isFullscreen ? "全画面を終了" : "全画面で表示"}
            title={isFullscreen ? "全画面を終了" : "全画面で表示"}
          >
            {isFullscreen ? "⤡" : "⛶"}
          </button>
        )}
        <button
          onClick={onToggleSettings}
          aria-expanded={showSettings}
          className={`text-lg ${buttonClass}`}
          aria-label="待ち時間の設定"
        >
          ⚙
        </button>
      </div>
    </>
  );
}

function SettingsPanel({
  lanes,
  onChangeLanes,
  onClose,
}: {
  lanes: number;
  onChangeLanes: (value: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute right-2 top-14 z-30 w-[min(20rem,calc(100vw-1rem))] rounded-2xl bg-white p-4 shadow-xl ring-1 ring-slate-200">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold">同時に作れる注文数</p>
        <button
          onClick={onClose}
          className="h-7 w-7 rounded-full text-slate-400 active:bg-slate-100"
          aria-label="閉じる"
        >
          ✕
        </button>
      </div>
      <div className="flex gap-2">
        {LANE_CHOICES.map((n) => (
          <button
            key={n}
            onClick={() => onChangeLanes(n)}
            className={`flex-1 rounded-lg py-3 font-bold ${
              lanes === n
                ? "bg-brand text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200"
            }`}
          >
            {n}件
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        何組ぶんを並行して作れるかの目安です。増やすと待ち時間の表示が短くなります。
        この設定はこの端末にだけ保存されます。
      </p>
    </div>
  );
}

function TicketSection({
  title,
  tone,
  entries,
  etaText,
}: {
  title: string;
  tone: "amber" | "slate";
  entries: QueueEstimate[];
  etaText: (entry: QueueEstimate) => string;
}) {
  const styles =
    tone === "amber"
      ? { head: "text-amber-700", chip: "bg-amber-50 text-amber-800" }
      : { head: "text-slate-500", chip: "bg-white text-slate-700" };

  return (
    <section className="shrink-0">
      <p className={`mb-1.5 text-xs font-bold sm:text-sm ${styles.head}`}>
        {title}
      </p>
      <ul className="space-y-2">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 shadow-sm sm:px-4 sm:py-3 ${styles.chip}`}
          >
            <span className={`font-bold leading-none ${SIZE.ticket}`}>
              #{entry.ticket_no}
            </span>
            <span className="shrink-0 text-xs font-bold sm:text-base">
              {etaText(entry)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-full flex-col items-center justify-center p-6 text-center">
      {children}
    </main>
  );
}
