"use client";

import Link from "next/link";
import type { Room } from "@/lib/types";

export function RoomHeader({
  room,
  title,
}: {
  room: Room;
  title: string;
}) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-white px-4 py-3 shadow-sm">
      <Link
        href={`/room/${room.code}`}
        className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-slate-500 active:bg-slate-100"
        aria-label="部屋メニューへ戻る"
      >
        ‹
      </Link>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{title}</p>
        <p className="truncate text-xs text-slate-400">
          {room.name} · {room.code}
        </p>
      </div>
    </header>
  );
}
