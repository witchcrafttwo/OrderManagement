import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE, verifySessionToken } from "@/lib/adminAuth";
import { deleteRoomById } from "@/lib/repo";
import { isUuid, jsonError, serverError } from "@/lib/http";

export const runtime = "nodejs";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(ADMIN_COOKIE)?.value);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return jsonError("認証が必要です", 401);
  }

  const { id } = await params;
  if (!isUuid(id)) {
    return jsonError("IDの形式が不正です", 400);
  }

  try {
    const deleted = await deleteRoomById(id);
    if (!deleted) return jsonError("部屋が見つかりません", 404);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return serverError(err);
  }
}
