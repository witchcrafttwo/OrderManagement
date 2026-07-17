"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { yen } from "@/lib/format";

export interface RoomRow {
  id: string;
  code: string;
  name: string;
  created_at: string;
  orderCount: number;
  doneCount: number;
  sales: number;
}

export function AdminDashboard({ rooms }: { rooms: RoomRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);

  const totalSales = rooms.reduce((s, r) => s + r.sales, 0);
  const totalOrders = rooms.reduce((s, r) => s + r.orderCount, 0);

  async function createRoom() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          code: codeInput.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "作成に失敗しました");
        return;
      }
      setCreatedCode(data.room.code);
      setName("");
      setCodeInput("");
      router.refresh();
      setTimeout(() => setCreatedCode(null), 6000);
    } catch {
      setError("通信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRoom(room: RoomRow) {
    if (
      !confirm(
        `部屋「${room.name}」(${room.code})を削除します。\nメニュー・注文もすべて消え、元に戻せません。よろしいですか?`
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/rooms/${room.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "削除に失敗しました");
        return;
      }
      router.refresh();
    } catch {
      setError("通信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-4xl p-4 pb-16">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">🛠 管理画面</h1>
        <button
          onClick={logout}
          className="rounded-lg border px-3 py-2 text-sm font-bold text-slate-600 active:bg-slate-100"
        >
          ログアウト
        </button>
      </header>

      {/* 全体サマリー */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="部屋数" value={`${rooms.length}`} />
        <Stat label="総注文数" value={`${totalOrders}`} />
        <Stat label="総売上" value={yen(totalSales)} />
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {createdCode && (
        <div className="mb-4 rounded-lg bg-emerald-50 p-4 text-center">
          <p className="text-sm text-emerald-700">部屋を作成しました</p>
          <p className="text-2xl font-bold tracking-widest text-emerald-700">
            {createdCode}
          </p>
        </div>
      )}

      {/* 部屋を発行 */}
      <section className="mb-6 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-bold">新しい部屋を発行</h2>
        <div className="space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="出店名(例: たこ焼き屋台)"
            className="w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-brand"
          />
          <div className="flex gap-2">
            <input
              value={codeInput}
              onChange={(e) =>
                setCodeInput(
                  e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")
                )
              }
              onKeyDown={(e) => e.key === "Enter" && createRoom()}
              placeholder="コード(任意・空欄で自動)"
              maxLength={16}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-3 font-mono tracking-widest outline-none focus:border-brand"
            />
            <button
              onClick={createRoom}
              disabled={busy || !name.trim()}
              className="rounded-lg bg-brand px-5 font-bold text-white active:bg-brand-dark disabled:opacity-50"
            >
              発行
            </button>
          </div>
          <p className="text-xs text-slate-400">
            コードは英数字2〜16文字。空欄なら自動で6桁を発行します。
          </p>
        </div>
      </section>

      {/* 部屋一覧 */}
      <h2 className="mb-2 text-sm font-bold text-slate-500">
        部屋一覧 ({rooms.length})
      </h2>
      {rooms.length === 0 ? (
        <p className="rounded-2xl bg-white p-8 text-center text-sm text-slate-400 shadow-sm">
          まだ部屋がありません。上から発行してください。
        </p>
      ) : (
        <ul className="space-y-2">
          {rooms.map((room) => (
            <li
              key={room.id}
              className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{room.name}</p>
                <p className="text-xs text-slate-400">
                  <span className="font-mono tracking-widest text-brand">
                    {room.code}
                  </span>
                  {" · "}
                  注文 {room.orderCount}件(完了 {room.doneCount}) ·{" "}
                  {yen(room.sales)}
                </p>
              </div>
              <Link
                href={`/room/${room.code}`}
                className="rounded-lg border px-3 py-2 text-xs font-bold text-slate-600 active:bg-slate-100"
              >
                開く
              </Link>
              <button
                onClick={() => deleteRoom(room)}
                disabled={busy}
                className="rounded-lg bg-red-500 px-3 py-2 text-xs font-bold text-white active:bg-red-600 disabled:opacity-50"
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-3 text-center shadow-sm">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
