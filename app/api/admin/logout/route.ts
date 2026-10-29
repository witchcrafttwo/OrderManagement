import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function POST() {
  const cookieStore = await cookies();
  // 発行時と同じ path を指定しないと消えないブラウザがある
  cookieStore.delete({ name: ADMIN_COOKIE, path: "/" });
  return NextResponse.json({ ok: true });
}
