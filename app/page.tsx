"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { generateRoomCode } from "@/lib/format";

export default function HomePage() {
  const router = useRouter();
  const [roomName, setRoomName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!roomName.trim()) {
      setError("出店名を入力してください");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // コード重複を避けるため数回リトライ
      let code = "";
      for (let attempt = 0; attempt < 5; attempt++) {
        code = generateRoomCode();
        const { error: insertError } = await supabase
          .from("rooms")
          .insert({ code, name: roomName.trim() });
        if (!insertError) {
          router.push(`/room/${code}`);
          return;
        }
        if (insertError.code !== "23505") {
          // 一意制約違反(23505)以外は即エラー
          throw insertError;
        }
      }
      throw new Error("部屋コードの生成に失敗しました。もう一度お試しください。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "部屋の作成に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setError("部屋コードを入力してください");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: selectError } = await supabase
        .from("rooms")
        .select("code")
        .eq("code", code)
        .maybeSingle();
      if (selectError) throw selectError;
      if (!data) {
        setError("その部屋コードは見つかりませんでした");
        return;
      }
      router.push(`/room/${code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "参加に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-8 p-6">
      <header className="text-center">
        <h1 className="text-3xl font-bold text-brand">🍢 屋台オーダー</h1>
        <p className="mt-2 text-sm text-slate-500">
          出店の注文をリアルタイム管理
        </p>
      </header>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 部屋を立てる */}
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-bold">部屋を立てる</h2>
        <input
          type="text"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          placeholder="出店名(例: たこ焼き屋台)"
          className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-3 text-base outline-none focus:border-brand"
        />
        <button
          onClick={handleCreate}
          disabled={loading}
          className="w-full rounded-lg bg-brand py-3 font-bold text-white active:bg-brand-dark disabled:opacity-50"
        >
          新しい部屋を作る
        </button>
      </section>

      {/* 部屋に参加 */}
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-bold">部屋に参加</h2>
        <input
          type="text"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          placeholder="部屋コード(例: ABC123)"
          maxLength={6}
          className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-3 text-center text-lg font-mono tracking-widest outline-none focus:border-brand"
        />
        <button
          onClick={handleJoin}
          disabled={loading}
          className="w-full rounded-lg border-2 border-brand py-3 font-bold text-brand active:bg-orange-50 disabled:opacity-50"
        >
          参加する
        </button>
      </section>
    </main>
  );
}
