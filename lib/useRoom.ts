"use client";

import { useEffect, useState } from "react";
import { ApiError, roomApi } from "@/lib/api";
import type { Room } from "@/lib/types";

interface UseRoomResult {
  room: Room | null;
  loading: boolean;
  error: string | null;
}

/** 部屋コードから部屋情報を読み込む */
export function useRoom(code: string): UseRoomResult {
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const found = await roomApi.get(code);
        if (!active) return;
        setRoom(found);
        setError(null);
      } catch (err) {
        if (!active) return;
        setRoom(null);
        setError(
          err instanceof ApiError && err.status === 404
            ? "部屋が見つかりません"
            : err instanceof Error
              ? err.message
              : "部屋の読み込みに失敗しました"
        );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [code]);

  return { room, loading, error };
}
