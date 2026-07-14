"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
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
      const { data, error: selectError } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", code.toUpperCase())
        .maybeSingle();
      if (!active) return;
      if (selectError) {
        setError(selectError.message);
      } else if (!data) {
        setError("部屋が見つかりません");
      } else {
        setRoom(data as Room);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [code]);

  return { room, loading, error };
}
