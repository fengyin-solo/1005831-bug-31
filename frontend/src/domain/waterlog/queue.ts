import { evaluatePriority } from './priority'
import { listRecall, listWaterlog } from './store'
import type { PriorityResult, RecallTask, WaterlogRecord } from './types'

/**
 * 派队队列的唯一拼装入口。列表页、详情页、归队看板都从这里取数，
 * 任何一处都不再单独按积水深度或影响范围重排优先级。
 */

export type WaterlogView = WaterlogRecord & {
  /** 该点位此刻对外展示的唯一优先级结论。 */
  priority: PriorityResult
  /** true 表示结论是派队当时冻结的历史快照（不随算法调整重算）。 */
  frozen: boolean
}

export type QueueSection = {
  /** 待派队：界内待处置，按唯一算法实时排序。 */
  pending: WaterlogView[]
  /** 影响范围超出边界：单独提出、走移交，不进正常派队队列。 */
  outOfBoundary: WaterlogView[]
  /** 已派队：处置中 / 已退水 / 已升级，展示冻结的历史结论。 */
  dispatched: WaterlogView[]
}

/**
 * 取一条内涝记录的有效优先级：
 * - 待处置（未派队）：按当前数据实时推算；
 * - 已派队：直接采用派队当时冻结的快照，算法再怎么调整都不重算。
 */
export function effectivePriority(record: WaterlogRecord): PriorityResult {
  if (record.prioritySnapshot) {
    return record.prioritySnapshot
  }
  return evaluatePriority({
    depthCm: record.depthCm,
    affectedAreaM2: record.affectedAreaM2,
    affectedPeople: record.affectedPeople,
    lng: record.lng,
    lat: record.lat,
    radiusM: record.radiusM,
  })
}

export function toView(record: WaterlogRecord): WaterlogView {
  return { ...record, priority: effectivePriority(record), frozen: record.prioritySnapshot !== null }
}

/** 同一内涝编号 → 同一份视图，详情页只凭编号取数。 */
export function getWaterlogView(code: string): WaterlogView | undefined {
  const record = listWaterlog().find((item) => item.code === code)
  return record ? toView(record) : undefined
}

function rankDescending(a: WaterlogView, b: WaterlogView): number {
  if (b.priority.rankScore !== a.priority.rankScore) {
    return b.priority.rankScore - a.priority.rankScore
  }
  // 同分时上报早的优先，仍相同则按内涝编号兜底，保证三入口顺序稳定一致。
  if (a.firstReportAt !== b.firstReportAt) {
    return a.firstReportAt.localeCompare(b.firstReportAt)
  }
  return a.code.localeCompare(b.code)
}

/** 列表 / 看板共用的分组队列。 */
export function dispatchQueue(): QueueSection {
  const views = listWaterlog().map(toView)
  const section: QueueSection = { pending: [], outOfBoundary: [], dispatched: [] }
  for (const view of views) {
    if (view.status !== '待处置') {
      section.dispatched.push(view)
      continue
    }
    if (view.priority.boundary === '超出边界') {
      section.outOfBoundary.push(view)
    } else {
      section.pending.push(view)
    }
  }
  section.pending.sort(rankDescending)
  section.outOfBoundary.sort(rankDescending)
  // 已派队历史按派队时间倒序，保持当时结论，不参与重新派队排序。
  section.dispatched.sort((a, b) => b.dispatchedAt.localeCompare(a.dispatchedAt))
  return section
}

/** 归队看板：待归队在前、已归队在后，结论都取退水当时的快照。 */
export function recallBoard(): { waiting: RecallTask[]; returned: RecallTask[] } {
  const tasks = listRecall()
  return {
    waiting: tasks
      .filter((task) => task.status === '待归队')
      .sort((a, b) => b.recededAt.localeCompare(a.recededAt)),
    returned: tasks
      .filter((task) => task.status === '已归队')
      .sort((a, b) => b.returnedAt.localeCompare(a.returnedAt)),
  }
}
