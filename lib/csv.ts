import type { OrderWithItems } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  pending: "未着手",
  preparing: "作成中",
  done: "完成",
};

/** CSVの1セルをエスケープ(カンマ・改行・ダブルクォート対応) */
function cell(value: string | number | null): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * 注文データを明細単位のCSV文字列に変換する。
 * 1商品 = 1行。同じ注文の情報は各行に繰り返し出力する。
 */
export function ordersToCsv(orders: OrderWithItems[]): string {
  const header = [
    "呼び出し番号",
    "注文日時",
    "完了日時",
    "状態",
    "商品名",
    "単価",
    "数量",
    "小計",
    "注文合計",
    "備考",
  ];
  const rows: string[] = [header.map(cell).join(",")];

  for (const o of orders) {
    const created = new Date(o.created_at).toLocaleString("ja-JP");
    const completed = o.completed_at
      ? new Date(o.completed_at).toLocaleString("ja-JP")
      : "";
    const status = STATUS_LABEL[o.status] ?? o.status;

    if (o.order_items.length === 0) {
      rows.push(
        [o.ticket_no, created, completed, status, "", "", "", "", o.total, o.note]
          .map(cell)
          .join(",")
      );
      continue;
    }

    for (const it of o.order_items) {
      rows.push(
        [
          o.ticket_no,
          created,
          completed,
          status,
          it.name,
          it.price,
          it.quantity,
          it.price * it.quantity,
          o.total,
          o.note,
        ]
          .map(cell)
          .join(",")
      );
    }
  }

  return rows.join("\r\n");
}

/** CSV文字列をファイルとしてダウンロードさせる(Excel向けにUTF-8 BOM付き) */
export function downloadCsv(filename: string, csv: string): void {
  const bom = "\uFEFF"; // Excelで日本語が文字化けしないように
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
