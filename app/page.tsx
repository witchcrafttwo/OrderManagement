"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function HomePage() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      {/* 部屋に参加 */}
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-bold">部屋に参加</h2>
        <input
          type="text"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          placeholder="部屋コード(例: ABC123)"
          maxLength={16}
          className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-3 text-center text-lg font-mono tracking-widest outline-none focus:border-brand"
        />
        <button
          onClick={handleJoin}
          disabled={loading}
          className="w-full rounded-lg bg-brand py-3 font-bold text-white active:bg-brand-dark disabled:opacity-50"
        >
          参加する
        </button>
        <p className="mt-3 text-center text-xs text-slate-400">
          部屋コードは管理者から受け取ってください
        </p>
      </section>

      {/* 管理者リンク */}
      <div className="text-center">
        <Link
          href="/admin"
          className="text-sm font-bold text-slate-500 underline"
        >
          🔐 管理者の方はこちら
        </Link>
      </div>
    </main>
  );
}
