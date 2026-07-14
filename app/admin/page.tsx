import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, verifySessionToken } from "@/lib/adminAuth";
import { getAdminClient } from "@/lib/supabase/admin";
import { AdminDashboard, type RoomRow } from "./AdminDashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const cookieStore = await cookies();
  if (!verifySessionToken(cookieStore.get(ADMIN_COOKIE)?.value)) {
    redirect("/admin/login");
  }

  const supabase = getAdminClient();
  const [{ data: rooms }, { data: orders }] = await Promise.all([
    supabase.from("rooms").select("*").order("created_at", { ascending: false }),
    supabase.from("orders").select("room_id,status,total"),
  ]);

  const statsByRoom = new Map<
    string,
    { orderCount: number; doneCount: number; sales: number }
  >();
  for (const o of orders ?? []) {
    const s = statsByRoom.get(o.room_id) ?? {
      orderCount: 0,
      doneCount: 0,
      sales: 0,
    };
    s.orderCount += 1;
    if (o.status === "done") {
      s.doneCount += 1;
      s.sales += o.total;
    }
    statsByRoom.set(o.room_id, s);
  }

  const rows: RoomRow[] = (rooms ?? []).map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    created_at: r.created_at,
    ...(statsByRoom.get(r.id) ?? { orderCount: 0, doneCount: 0, sales: 0 }),
  }));

  return <AdminDashboard rooms={rows} />;
}
