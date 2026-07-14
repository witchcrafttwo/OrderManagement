import { createClient } from "@supabase/supabase-js";

/**
 * サーバー専用の Supabase クライアント。
 * service_role キーを使うため RLS を回避できる。
 * 絶対にクライアント(ブラウザ)側で import しないこと。
 */
export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です"
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
