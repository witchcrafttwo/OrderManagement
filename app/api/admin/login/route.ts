import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  createSessionToken,
  verifyAdminPassword,
} from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!process.env.ADMIN_PASSWORD) {
    return NextResponse.json(
      { error: "サーバーに ADMIN_PASSWORD が設定されていません" },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }

  const password = (body as { password?: unknown })?.password;
  if (!verifyAdminPassword(password)) {
    return NextResponse.json(
      { error: "パスワードが違います" },
      { status: 401 }
    );
  }

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE, createSessionToken(), adminCookieOptions(req));

  return NextResponse.json({ ok: true });
}
