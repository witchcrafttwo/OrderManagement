/** 金額を「¥1,200」形式に整形 */
export function yen(amount: number): string {
  return "¥" + amount.toLocaleString("ja-JP");
}

/** 部屋コードを生成(紛らわしい文字を除外した6桁) */
export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 0/O, 1/I を除外
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** 経過時間を「3分前」「1時間5分」形式に */
export function elapsed(from: string): string {
  const diffMs = Date.now() - new Date(from).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "たった今";
  if (min < 60) return `${min}分前`;
  const h = Math.floor(min / 60);
  return `${h}時間${min % 60}分前`;
}
