import type { WaitQueueEntry } from "@/lib/types";

/**
 * 待ち時間の見積もりロジック(純関数)。
 *
 * 考え方:
 *   - 注文1件の製作時間 = その注文に入っている商品の製作時間の合計
 *     (同じ商品を複数個頼んでも1回ぶんとして数える = まとめて作る想定)
 *   - 「同時に作れる注文数」(lanes)ぶんの作業レーンがあると考えて、
 *     いちばん早く空くレーンに古い注文から順に割り当てていく
 *   - すでに「作成中」の注文は着手済みなので、経過した時間を差し引く
 *
 * あくまで目安です。厳密な予測ではありません。
 */

export interface QueueEstimate extends WaitQueueEntry {
  /** あと何分でできあがる見込みか(切り上げ) */
  etaMinutes: number;
  /** この注文に残っている製作時間(分・切り上げ) */
  remainingMinutes: number;
}

export interface WaitEstimate {
  /** 行列全体(古い順) */
  entries: QueueEstimate[];
  /** 作成中の注文 */
  preparing: QueueEstimate[];
  /** まだ着手していない注文 */
  pending: QueueEstimate[];
  /** いまの行列がすべてはけるまでの分数 = 表示する「待ち時間」 */
  totalWaitMinutes: number;
}

/** 同時に作れる注文数の選択肢 */
export const LANE_CHOICES = [1, 2, 3, 4] as const;
export const DEFAULT_LANES = 1;

/** 1商品あたりの製作時間の上限(分) */
export const MAX_PREP_MINUTES = 600;

/** その注文に残っている製作時間(分・小数) */
function remainingMinutesRaw(order: WaitQueueEntry, now: number): number {
  if (order.prep_minutes <= 0) return 0;
  if (order.status !== "preparing" || !order.started_at) {
    return order.prep_minutes;
  }
  const spentMinutes = (now - new Date(order.started_at).getTime()) / 60_000;
  return Math.max(0, order.prep_minutes - spentMinutes);
}

export function estimateWait(
  queue: WaitQueueEntry[],
  lanes: number = DEFAULT_LANES,
  now: number = Date.now()
): WaitEstimate {
  const laneCount = Math.max(1, Math.floor(lanes) || DEFAULT_LANES);
  const laneEnds = new Array<number>(laneCount).fill(0);
  const entries: QueueEstimate[] = [];

  for (const order of queue) {
    const remaining = remainingMinutesRaw(order, now);

    // いちばん早く空くレーンを選ぶ
    let lane = 0;
    for (let i = 1; i < laneCount; i++) {
      if (laneEnds[i] < laneEnds[lane]) lane = i;
    }

    // 作成中の注文はもう手がついているので、順番を待たずに進む
    const startAt = order.status === "preparing" ? 0 : laneEnds[lane];
    const eta = startAt + remaining;
    laneEnds[lane] = Math.max(laneEnds[lane], eta);

    entries.push({
      ...order,
      remainingMinutes: Math.ceil(remaining),
      etaMinutes: Math.ceil(eta),
    });
  }

  return {
    entries,
    preparing: entries.filter((e) => e.status === "preparing"),
    pending: entries.filter((e) => e.status !== "preparing"),
    totalWaitMinutes: Math.ceil(Math.max(0, ...laneEnds)),
  };
}
