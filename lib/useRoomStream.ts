"use client";

import { useEffect, useRef } from "react";
import type { RoomChange } from "@/lib/types";

/**
 * 部屋の変更を Server-Sent Events で受け取る(Supabase Realtime の置き換え)。
 *
 * 切断されたときは EventSource が自動で再接続する。
 * サーバー側の LISTEN が張り直された場合は event: 'RESYNC' が届くので、
 * 呼び出し側は「通知が来たら読み直す」だけ書けばよい。
 *
 * @param code   部屋コード(null なら購読しない)
 * @param onChange 変更通知を受け取るコールバック
 */
export function useRoomStream(
  code: string | null | undefined,
  onChange: (change: RoomChange) => void
): void {
  // 毎レンダーで購読し直さないように最新のコールバックを ref に持つ
  const handlerRef = useRef(onChange);
  useEffect(() => {
    handlerRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!code) return;

    const source = new EventSource(
      `/api/rooms/${encodeURIComponent(code)}/stream`
    );

    const handleChange = (event: MessageEvent<string>) => {
      try {
        handlerRef.current(JSON.parse(event.data) as RoomChange);
      } catch {
        /* 壊れたペイロードは無視 */
      }
    };

    source.addEventListener("change", handleChange as EventListener);

    return () => {
      source.removeEventListener("change", handleChange as EventListener);
      source.close();
    };
  }, [code]);
}
