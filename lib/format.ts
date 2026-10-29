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

/** 分数を「15分」「1時間20分」形式に */
export function minutesLabel(minutes: number): string {
  const total = Math.max(0, Math.ceil(minutes));
  if (total < 60) return `${total}分`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

/** 待ち時間の表示。0分なら「待ちなし」 */
export function waitLabel(minutes: number): string {
  const total = Math.max(0, Math.ceil(minutes));
  return total === 0 ? "待ちなし" : `約${minutesLabel(total)}`;
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
