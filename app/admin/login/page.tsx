"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!password) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "ログインに失敗しました");
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setError("通信に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-6 p-6">
      <header className="text-center">
        <h1 className="text-2xl font-bold">🔐 管理者ログイン</h1>
        <p className="mt-1 text-sm text-slate-500">
          部屋の発行・管理を行うにはログインが必要です
        </p>
      </header>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          placeholder="管理者パスワード"
          className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-brand"
          autoFocus
        />
        <button
          onClick={handleLogin}
          disabled={loading || !password}
          className="w-full rounded-lg bg-slate-800 py-3 font-bold text-white active:bg-slate-900 disabled:opacity-50"
        >
          {loading ? "確認中..." : "ログイン"}
        </button>
      </div>
    </main>
  );
}
