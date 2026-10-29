import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, verifySessionToken } from "@/lib/adminAuth";
import { listRoomsWithStats } from "@/lib/repo";
import { AdminDashboard, type RoomRow } from "./AdminDashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const cookieStore = await cookies();
  if (!verifySessionToken(cookieStore.get(ADMIN_COOKIE)?.value)) {
    redirect("/admin/login");
  }

  // 部屋一覧と注文集計を SQL 側(GROUP BY)でまとめて取得する
  let rooms: RoomRow[];
  try {
    rooms = await listRoomsWithStats();
  } catch (err) {
    return <ConnectionError message={errorText(err)} />;
  }

  return <AdminDashboard rooms={rooms} />;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function ConnectionError({ message }: { message: string }) {
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-4 text-xl font-bold">🛠 管理画面</h1>
      <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">
        <p className="font-bold">データベースに接続できませんでした</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>PostgreSQL が起動しているか</li>
          <li>.env.local の DATABASE_URL が正しいか</li>
          <li>
            テーブル作成がまだなら{" "}
            <code className="rounded bg-white px-1 font-mono">
              npm run db:setup
            </code>{" "}
            を実行
          </li>
        </ul>
        <p className="mt-3 break-all font-mono text-xs text-red-500">
          {message}
        </p>
      </div>
    </main>
  );
}
