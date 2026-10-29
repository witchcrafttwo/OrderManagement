import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE, verifySessionToken } from "@/lib/adminAuth";
import { isUniqueViolation } from "@/lib/db";
import { createRoom } from "@/lib/repo";
import { generateRoomCode } from "@/lib/format";
import { jsonError, serverError } from "@/lib/http";
import type { Room } from "@/lib/types";

export const runtime = "nodejs";

const CODE_RE = /^[A-Z0-9]{2,16}$/;
const MAX_GENERATE_ATTEMPTS = 5;

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(ADMIN_COOKIE)?.value);
}

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return jsonError("認証が必要です", 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("不正なリクエスト", 400);
  }

  const rawName = (body as { name?: unknown })?.name;
  if (typeof rawName !== "string" || !rawName.trim()) {
    return jsonError("出店名を入力してください", 400);
  }
  const name = rawName.trim();

  try {
    // 管理者がコードを指定した場合
    const rawCode = (body as { code?: unknown })?.code;
    if (typeof rawCode === "string" && rawCode.trim()) {
      const code = rawCode.trim().toUpperCase();
      if (!CODE_RE.test(code)) {
        return jsonError("コードは英数字2〜16文字で入力してください", 400);
      }
      try {
        const room = await createRoom(code, name);
        return NextResponse.json({ room });
      } catch (err) {
        if (isUniqueViolation(err)) {
          return jsonError(`コード「${code}」は既に使われています`, 409);
        }
        throw err;
      }
    }

    // 指定なし: 自動生成(衝突したらやり直す)
    for (let attempt = 0; attempt < MAX_GENERATE_ATTEMPTS; attempt++) {
      let room: Room;
      try {
        room = await createRoom(generateRoomCode(), name);
      } catch (err) {
        if (isUniqueViolation(err)) continue;
        throw err;
      }
      return NextResponse.json({ room });
    }
    return jsonError("部屋コードの生成に失敗しました", 500);
  } catch (err) {
    return serverError(err);
  }
}
