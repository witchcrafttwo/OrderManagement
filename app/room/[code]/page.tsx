"use client";

import Link from "next/link";
import { use } from "react";
import { useRoom } from "@/lib/useRoom";

const roles = [
  {
    href: "register",
    icon: "📝",
    title: "レジ",
    desc: "注文を受け付ける",
    className: "bg-brand text-white",
  },
  {
    href: "kitchen",
    icon: "🍳",
    title: "厨房",
    desc: "作る・完成にする",
    className: "bg-emerald-600 text-white",
  },
  {
    href: "menu",
    icon: "🍔",
    title: "メニュー編集",
    desc: "商品の追加・変更",
    className: "bg-white text-slate-800 border",
  },
  {
    href: "sales",
    icon: "📊",
    title: "売上・履歴",
    desc: "集計を見る",
    className: "bg-white text-slate-800 border",
  },
];

export default function RoomHubPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const { room, loading, error } = useRoom(code);

  if (loading) {
    return <CenterMessage>読み込み中...</CenterMessage>;
  }
  if (error || !room) {
    return (
      <CenterMessage>
        <p className="mb-4 text-red-600">{error ?? "部屋が見つかりません"}</p>
        <Link href="/" className="font-bold text-brand underline">
          ホームに戻る
        </Link>
      </CenterMessage>
    );
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-bold">{room.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          部屋コード{" "}
          <span className="font-mono text-lg font-bold tracking-widest text-brand">
            {room.code}
          </span>
        </p>
        <p className="mt-1 text-xs text-slate-400">
          このコードを他のデバイスで入力すると参加できます
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4">
        {roles.map((r) => (
          <Link
            key={r.href}
            href={`/room/${room.code}/${r.href}`}
            className={`flex flex-col items-center gap-1 rounded-2xl p-6 shadow-sm active:scale-95 ${r.className}`}
          >
            <span className="text-4xl">{r.icon}</span>
            <span className="mt-1 font-bold">{r.title}</span>
            <span className="text-xs opacity-80">{r.desc}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}

function CenterMessage({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-full flex-col items-center justify-center p-6 text-center">
      {children}
    </main>
  );
}
