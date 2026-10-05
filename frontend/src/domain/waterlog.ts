import { listRows, saveRows } from '@/data/local-store'
import type { ActionResult, EntryRow } from '@/data/types'

/**
 * 内涝派队算法——全局唯一实现（收拢前列表、详情、归队看板各算各的，结论互相打架）。
 *
 * 取数约定：
 * - 内涝编号是唯一入口，任何页面都只能通过编号 / 行记录从这里取数；
 * - 积水深度、影响范围的分档与派队优先级只在本文件推算一次，列表、详情、看板共用结论；
 * - 已派过队的记录在派队那一刻落快照（优先级冻结），之后算法怎么调都不重算，保留当时结论；
 * - 重复上报同一内涝编号只更新同一条，绝不新增第二条；
 * - 影响范围超出责任边界的点位单独提出，不进正常派队队列；
 * - 处置状态只能沿「待处置 → 处置中 → 已退水」单向推进，另可升级为终态「已升级」；
 * - 内涝退水的结论自动落到抢险队的待归队清单，历史任务结论保持原样。
 */

export const WATERLOG_KEY = 'waterlog'
export const RESCUE_KEY = 'rescueteam'

export const WATERLOG_STATUSES = ['待处置', '处置中', '已退水', '已升级'] as const
export type WaterlogStatus = (typeof WATERLOG_STATUSES)[number]
// 处置状态的单向推进次序：只允许下标变大，不允许回退。
const STATUS_ORDER: Record<WaterlogStatus, number> = {
  待处置: 0,
  处置中: 1,
  已退水: 2,
  已升级: 3,
}

export const RESCUE_STATUSES = ['待派队', '抢险中', '待归队', '已归队', '已终止'] as const
export type RescueStatus = (typeof RESCUE_STATUSES)[number]

// ---------------------------------------------------------------------------
// 边界与分档参数：规则只在这里定义，任何入口不得自行魔改。
// ---------------------------------------------------------------------------

/** 各责任边界能承接的最大影响面积（㎡）；查不到的边界走默认值。 */
const BOUNDARY_AREA_LIMITS: Record<string, number> = {
  城东片区: 12000,
  城西片区: 12000,
  城南片区: 8000,
  城北片区: 8000,
  老城区: 5000,
}
const DEFAULT_BOUNDARY_LIMIT = 10000

type Band = { label: string; score: number }

/** 积水深度（cm）分档 */
function depthBand(cm: number): Band {
  if (cm >= 50) return { label: '深', score: 3 }
  if (cm >= 25) return { label: '中', score: 2 }
  if (cm >= 10) return { label: '浅', score: 1 }
  return { label: '轻微', score: 0.5 }
}

/** 影响范围（㎡）分档 */
function areaBand(m2: number): Band {
  if (m2 >= 2000) return { label: '大范围', score: 3 }
  if (m2 >= 500) return { label: '较大', score: 2 }
  if (m2 >= 100) return { label: '中等', score: 1 }
  return { label: '局部', score: 0.5 }
}

/** 权重：积水深度 0.6，影响范围 0.4，满分 3 分。 */
const DEPTH_WEIGHT = 0.6
const AREA_WEIGHT = 0.4

function priorityOfScore(score: number): { level: string; label: string } {
  if (score >= 2.6) return { level: '一级', label: '一级 · 紧急派队' }
  if (score >= 1.6) return { level: '二级', label: '二级 · 优先派队' }
  return { level: '三级', label: '三级 · 常规派队' }
}

// ---------------------------------------------------------------------------
// 取值与推算
// ---------------------------------------------------------------------------

function getStr(row: EntryRow, field: string): string {
  return String(row[field] ?? '').trim()
}

/** 兼容历史数据里可能带单位的写法（如 "35cm"、"1,200㎡"），统一解析成数值。 */
function getNum(row: EntryRow, field: string): number {
  const raw = String(row[field] ?? '').replace(/[,，\s]/g, '')
  const matched = raw.match(/-?\d+(\.\d+)?/)
  return matched ? Number(matched[0]) : 0
}

export type DerivedPriority = {
  depthCm: number
  depthLevel: string
  depthScore: number
  areaM2: number
  areaLevel: string
  areaScore: number
  boundaryName: string
  boundaryLimit: number
  occupancyRate: number
  outOfBoundary: boolean
  score: number
  priorityLevel: string
  priorityLabel: string
  /** 结论来源：实时推算 或 派队快照（历史记录保持当时结论）。 */
  basis: '实时推算' | '派队快照'
  frozenAt: string
}

/**
 * 唯一的推算函数：给一条内涝记录，算出深度分档、范围分档、越界判定与派队优先级。
 * 列表、详情、看板一律只能调用它（或 resolvePriority），不得另写算法。
 */
export function deriveWaterlog(row: EntryRow): DerivedPriority {
  const depthCm = getNum(row, '积水深度(cm)')
  const areaM2 = getNum(row, '影响范围(㎡)')
  const boundaryName = getStr(row, '责任边界') || '默认边界'
  const boundaryLimit = BOUNDARY_AREA_LIMITS[boundaryName] ?? DEFAULT_BOUNDARY_LIMIT

  const depth = depthBand(depthCm)
  const area = areaBand(areaM2)
  const score = Number((depth.score * DEPTH_WEIGHT + area.score * AREA_WEIGHT).toFixed(2))
  const priority = priorityOfScore(score)

  return {
    depthCm,
    depthLevel: depth.label,
    depthScore: depth.score,
    areaM2,
    areaLevel: area.label,
    areaScore: area.score,
    boundaryName,
    boundaryLimit,
    occupancyRate: boundaryLimit > 0 ? Number((areaM2 / boundaryLimit).toFixed(3)) : 0,
    outOfBoundary: areaM2 > boundaryLimit,
    score,
    priorityLevel: priority.level,
    priorityLabel: priority.label,
    basis: '实时推算',
    frozenAt: '',
  }
}

function isFrozen(row: EntryRow): boolean {
  return row['优先级冻结'] === true && String(row.status) !== '待处置'
}

/**
 * 三个入口共用的取数口径：
 * - 已派队记录读派队时冻结的快照（算法再调整也不重算，保留当时结论）；
 * - 未派队记录走唯一推算函数 deriveWaterlog。
 */
export function resolvePriority(row: EntryRow): DerivedPriority {
  if (isFrozen(row)) {
    const depthCm = getNum(row, '快照积水深度(cm)') || getNum(row, '积水深度(cm)')
    const areaM2 = getNum(row, '快照影响范围(㎡)') || getNum(row, '影响范围(㎡)')
    const boundaryName = getStr(row, '快照责任边界') || getStr(row, '责任边界') || '默认边界'
    const boundaryLimit = BOUNDARY_AREA_LIMITS[boundaryName] ?? DEFAULT_BOUNDARY_LIMIT
    const score = getNum(row, '派队评分')
    const level = getStr(row, '派队优先级') || priorityOfScore(score).level
    return {
      depthCm,
      depthLevel: getStr(row, '快照积水等级') || depthBand(depthCm).label,
      depthScore: depthBand(depthCm).score,
      areaM2,
      areaLevel: getStr(row, '快照影响等级') || areaBand(areaM2).label,
      areaScore: areaBand(areaM2).score,
      boundaryName,
      boundaryLimit,
      occupancyRate: boundaryLimit > 0 ? Number((areaM2 / boundaryLimit).toFixed(3)) : 0,
      outOfBoundary: row['快照越界'] === true,
      score,
      priorityLevel: level,
      priorityLabel: `${level} · 派队时冻结`,
      basis: '派队快照',
      frozenAt: getStr(row, '派队时间'),
    }
  }
  return deriveWaterlog(row)
}

// ---------------------------------------------------------------------------
// 存取：内涝编号是唯一入口
// ---------------------------------------------------------------------------

function waterlogs(): EntryRow[] {
  return listRows(WATERLOG_KEY)
}

function saveWaterlogs(rows: EntryRow[]): void {
  saveRows(WATERLOG_KEY, rows)
}

function rescues(): EntryRow[] {
  return listRows(RESCUE_KEY)
}

function saveRescues(rows: EntryRow[]): void {
  saveRows(RESCUE_KEY, rows)
}

/** 内涝编号唯一取数入口。 */
export function getWaterlogByCode(code: string): EntryRow | undefined {
  const key = code.trim()
  return waterlogs().find((row) => getStr(row, '内涝编号') === key)
}

export function getWaterlogById(id: number): EntryRow | undefined {
  return waterlogs().find((row) => Number(row.id) === id)
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function nextId(rows: EntryRow[]): number {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
}

// ---------------------------------------------------------------------------
// 上报：内涝编号重复只落一条
// ---------------------------------------------------------------------------

export type ReportInput = {
  code: string
  site: string
  depthCm: number
  areaM2: number
  boundary: string
  reporter: string
}

/**
 * 内涝上报。同一内涝编号重复上报只落一条：
 * - 尚在「待处置」：刷新最新测量值（此时还没派队，不涉及历史结论）；
 * - 已派队 / 已退水 / 已升级：拒绝改动，保留当时结论。
 */
export function reportWaterlog(input: ReportInput): ActionResult & { row?: EntryRow } {
  const code = input.code.trim()
  if (!code) return { ok: false, message: '内涝编号不能为空' }
  if (!input.site.trim()) return { ok: false, message: '内涝点位不能为空' }
  if (!Number.isFinite(input.depthCm) || input.depthCm < 0) {
    return { ok: false, message: '积水深度需为不小于 0 的数值（cm）' }
  }
  if (!Number.isFinite(input.areaM2) || input.areaM2 < 0) {
    return { ok: false, message: '影响范围需为不小于 0 的数值（㎡）' }
  }

  const rows = waterlogs()
  const existing = rows.find((row) => getStr(row, '内涝编号') === code)
  if (existing) {
    if (String(existing.status) !== '待处置') {
      return { ok: false, message: `内涝编号 ${code} 已在处置流程中，重复上报不落新单，保留当时结论` }
    }
    const derived = deriveWaterlog({
      ...existing,
      '积水深度(cm)': input.depthCm,
      '影响范围(㎡)': input.areaM2,
      责任边界: input.boundary,
    })
    Object.assign(existing, {
      内涝点位: input.site.trim(),
      '积水深度(cm)': input.depthCm,
      '影响范围(㎡)': input.areaM2,
      责任边界: input.boundary.trim(),
      上报时间: today(),
      上报人: input.reporter.trim() || getStr(existing, '上报人'),
      abnormal: derived.outOfBoundary,
    })
    saveWaterlogs([...rows])
    return { ok: true, message: `内涝编号 ${code} 已有待处置记录，已按最新上报更新测量值`, row: existing }
  }

  const draft: EntryRow = {
    id: nextId(rows),
    status: '待处置',
    pending: true,
    abnormal: false,
    内涝编号: code,
    内涝点位: input.site.trim(),
    上报时间: today(),
    上报人: input.reporter.trim(),
    责任边界: input.boundary.trim(),
    '积水深度(cm)': input.depthCm,
    '影响范围(㎡)': input.areaM2,
    处置队: '',
    到场时间: '',
    派队时间: '',
    退水时间: '',
    '派队评分': 0,
    派队优先级: '',
    '优先级冻结': false,
    积水等级: '',
    影响等级: '',
    越界: false,
    越界说明: '',
  }
  const derived = deriveWaterlog(draft)
  draft.abnormal = derived.outOfBoundary
  draft.越界 = derived.outOfBoundary
  draft.越界说明 = derived.outOfBoundary
    ? `影响范围 ${derived.areaM2}㎡ 超出${derived.boundaryName}边界 ${derived.boundaryLimit}㎡，需单独提级协调`
    : ''
  draft.积水等级 = derived.depthLevel
  draft.影响等级 = derived.areaLevel
  rows.push(draft)
  saveWaterlogs(rows)
  return { ok: true, message: `内涝编号 ${code} 已落一条待处置记录`, row: draft }
}

// ---------------------------------------------------------------------------
// 状态单向推进
// ---------------------------------------------------------------------------

function assertForward(from: string, to: WaterlogStatus): ActionResult | null {
  const fromOrder = STATUS_ORDER[from as WaterlogStatus]
  if (fromOrder === undefined) {
    return { ok: false, message: `当前状态「${from}」不在内涝处置状态内` }
  }
  if (from === to) {
    return { ok: false, message: `已经是「${to}」，不用重复操作` }
  }
  // 升级为终态允许从待处置/处置中进入；其余一律要求严格向前。
  if (to === '已升级') {
    return from === '待处置' || from === '处置中'
      ? null
      : { ok: false, message: `「${from}」是终态，不能再升级` }
  }
  if (STATUS_ORDER[to] <= fromOrder) {
    return { ok: false, message: `处置状态只能单向推进，不能从「${from}」回到「${to}」` }
  }
  return null
}

function findLinkedRescue(code: string): { rows: EntryRow[]; index: number } | null {
  const rows = rescues()
  const index = rows.findIndex((row) => getStr(row, '来源内涝编号') === code)
  return index >= 0 ? { rows, index } : null
}

/**
 * 派出处置：待处置 → 处置中。
 * 此刻把深度/范围/越界/评分/优先级整体冻结到记录上（历史结论快照），
 * 并在抢险队清单生成一条「抢险中」任务，任务优先级只回链内涝编号、由本文件取数。
 */
export function dispatchWaterlog(id: number, team: string): ActionResult & { row?: EntryRow } {
  const rows = waterlogs()
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) return { ok: false, message: '没有找到这条内涝记录' }
  const row = rows[index]
  const blocked = assertForward(String(row.status), '处置中')
  if (blocked) return blocked
  if (!team.trim()) return { ok: false, message: '请指定派出的处置队' }

  const derived = deriveWaterlog(row)
  const now = today()
  const updated: EntryRow = {
    ...row,
    status: '处置中',
    pending: true,
    abnormal: derived.outOfBoundary,
    处置队: team.trim(),
    到场时间: getStr(row, '到场时间') || now,
    派队时间: now,
    积水等级: derived.depthLevel,
    影响等级: derived.areaLevel,
    越界: derived.outOfBoundary,
    派队评分: derived.score,
    派队优先级: derived.priorityLevel,
    '优先级冻结': true,
    '快照积水深度(cm)': derived.depthCm,
    '快照影响范围(㎡)': derived.areaM2,
    快照积水等级: derived.depthLevel,
    快照影响等级: derived.areaLevel,
    快照责任边界: derived.boundaryName,
    快照越界: derived.outOfBoundary,
  }
  rows[index] = updated
  saveWaterlogs(rows)

  // 幂等：同一内涝编号只对应一条抢险任务，重复派队不新建。
  const rescueRows = rescues()
  const existed = rescueRows.find((item) => getStr(item, '来源内涝编号') === getStr(row, '内涝编号'))
  if (!existed) {
    rescueRows.push({
      id: nextId(rescueRows),
      status: '抢险中',
      pending: true,
      abnormal: false,
      任务编号: `RESC-W${getStr(row, '内涝编号').replace(/\D/g, '').padStart(4, '0')}`,
      任务类型: '内涝处置',
      目标点位: getStr(row, '内涝点位'),
      抢险队: team.trim(),
      出队时间: now,
      归队时间: '',
      负责人: team.trim(),
      来源内涝编号: getStr(row, '内涝编号'),
      退水结论: '',
      退水时间: '',
    })
    saveRescues(rescueRows)
  }
  return { ok: true, message: `已向 ${team} 派队（${derived.priorityLabel}），优先级按派队时结论冻结`, row: updated }
}

/**
 * 确认退水：处置中 → 已退水。
 * 退水结论（退水时间 + 派队时的优先级结论）自动落到对应抢险队的「待归队」清单。
 * 已经是终态的历史任务不被改动，保持当时结论。
 */
export function confirmRecede(id: number): ActionResult & { row?: EntryRow } {
  const rows = waterlogs()
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) return { ok: false, message: '没有找到这条内涝记录' }
  const row = rows[index]
  const blocked = assertForward(String(row.status), '已退水')
  if (blocked) return blocked

  const now = today()
  const frozen = resolvePriority(row)
  rows[index] = {
    ...row,
    status: '已退水',
    pending: false,
    退水时间: now,
    abnormal: frozen.outOfBoundary,
  }
  saveWaterlogs(rows)

  // 退水结论落到抢险队待归队清单；只推动当前仍在「抢险中」的那条联动任务。
  const linked = findLinkedRescue(getStr(row, '内涝编号'))
  if (linked && String(linked.rows[linked.index].status) === '抢险中') {
    const task = linked.rows[linked.index]
    linked.rows[linked.index] = {
      ...task,
      status: '待归队',
      pending: true,
      退水时间: now,
      退水结论: `内涝点 ${getStr(row, '内涝编号')} 已于 ${now} 退水，派队结论：${frozen.priorityLabel}，请安排归队`,
    }
    saveRescues(linked.rows)
  }
  return { ok: true, message: `内涝点已退水，结论已转入抢险队「待归队」清单（${frozen.priorityLevel}）`, row: rows[index] }
}

/** 上报升级：待处置 / 处置中 → 已升级（终态）。越界点位走这里提级协调。 */
export function escalateWaterlog(id: number): ActionResult & { row?: EntryRow } {
  const rows = waterlogs()
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) return { ok: false, message: '没有找到这条内涝记录' }
  const row = rows[index]
  const blocked = assertForward(String(row.status), '已升级')
  if (blocked) return blocked

  rows[index] = { ...row, status: '已升级', pending: false }
  saveWaterlogs(rows)
  return { ok: true, message: '内涝点已上报升级，交由上级协调处置', row: rows[index] }
}

/** 抢险队确认归队：待归队 → 已归队（单向）。 */
export function confirmReturn(rescueId: number): ActionResult {
  const rows = rescues()
  const index = rows.findIndex((row) => Number(row.id) === rescueId)
  if (index < 0) return { ok: false, message: '没有找到这条抢险任务' }
  const current = String(rows[index].status)
  if (current === '已归队') return { ok: false, message: '任务已归队，不用重复确认' }
  if (current === '已终止') return { ok: false, message: '任务已终止，不能再归队' }
  if (current !== '待归队') {
    return { ok: false, message: `当前为「${current}」，需先有退水结论进入「待归队」后才能归队` }
  }
  rows[index] = { ...rows[index], status: '已归队', pending: false, 归队时间: today() }
  saveRescues(rows)
  return { ok: true, message: '抢险队已确认归队' }
}

/** 通用抢险任务（无内涝来源）派队：待派队 → 抢险中。 */
export function dispatchGenericRescue(rescueId: number): ActionResult {
  const rows = rescues()
  const index = rows.findIndex((row) => Number(row.id) === rescueId)
  if (index < 0) return { ok: false, message: '没有找到这条抢险任务' }
  const current = String(rows[index].status)
  if (current !== '待派队') return { ok: false, message: `当前为「${current}」，不能派出` }
  rows[index] = { ...rows[index], status: '抢险中', pending: true, 出队时间: today() }
  saveRescues(rows)
  return { ok: true, message: '抢险队已派出' }
}

/** 通用抢险任务直接归队：抢险中 → 已归队（非内涝任务没有退水环节）。 */
export function finishGenericRescue(rescueId: number): ActionResult {
  const rows = rescues()
  const index = rows.findIndex((row) => Number(row.id) === rescueId)
  if (index < 0) return { ok: false, message: '没有找到这条抢险任务' }
  const current = String(rows[index].status)
  if (current !== '抢险中') return { ok: false, message: `当前为「${current}」，不能直接归队` }
  if (getStr(rows[index], '来源内涝编号')) {
    return { ok: false, message: '内涝处置任务需等待退水结论，进入「待归队」后归队' }
  }
  rows[index] = { ...rows[index], status: '已归队', pending: false, 归队时间: today() }
  saveRescues(rows)
  return { ok: true, message: '抢险队已确认归队' }
}

/** 终止任务：待派队 / 抢险中 → 已终止（终态）。 */
export function terminateRescue(rescueId: number): ActionResult {
  const rows = rescues()
  const index = rows.findIndex((row) => Number(row.id) === rescueId)
  if (index < 0) return { ok: false, message: '没有找到这条抢险任务' }
  const current = String(rows[index].status)
  if (current === '已终止') return { ok: false, message: '任务已终止' }
  if (current === '已归队') return { ok: false, message: '任务已归队，不能终止' }
  if (current === '待归队') return { ok: false, message: '任务已在待归队清单，请直接确认归队' }
  rows[index] = { ...rows[index], status: '已终止', pending: false }
  saveRescues(rows)
  return { ok: true, message: '抢险任务已终止' }
}

/** 登记一条通用抢险任务（待派队）。 */
export function createGenericRescue(input: {
  type: string
  site: string
  team: string
  leader: string
}): ActionResult & { row?: EntryRow } {
  if (!input.type.trim() || !input.site.trim()) {
    return { ok: false, message: '任务类型与目标点位不能为空' }
  }
  const rows = rescues()
  const row: EntryRow = {
    id: nextId(rows),
    status: '待派队',
    pending: true,
    abnormal: false,
    任务编号: `RESC-${String(nextId(rows)).padStart(4, '0')}`,
    任务类型: input.type.trim(),
    目标点位: input.site.trim(),
    抢险队: input.team.trim(),
    出队时间: '',
    归队时间: '',
    负责人: input.leader.trim(),
    来源内涝编号: '',
    退水结论: '',
    退水时间: '',
  }
  rows.push(row)
  saveRescues(rows)
  return { ok: true, message: `抢险任务 ${String(row.任务编号)} 已登记，待派队`, row }
}

// ---------------------------------------------------------------------------
// 三个入口共用的视图口径
// ---------------------------------------------------------------------------

export type WaterlogView = {
  row: EntryRow
  priority: DerivedPriority
}

function toView(row: EntryRow): WaterlogView {
  return { row, priority: resolvePriority(row) }
}

/** 内涝列表：正常派队队列（待处置且未越界，按唯一评分排序）+ 越界单独提出 + 处置中与历史。 */
export function waterlogQueue(): {
  pending: WaterlogView[]
  outOfBoundary: WaterlogView[]
  active: WaterlogView[]
  history: WaterlogView[]
} {
  const views = waterlogs().map(toView)
  const pending = views
    .filter((item) => String(item.row.status) === '待处置' && !item.priority.outOfBoundary)
    .sort(
      (a, b) =>
        b.priority.score - a.priority.score ||
        getStr(a.row, '上报时间').localeCompare(getStr(b.row, '上报时间')) ||
        getStr(a.row, '内涝编号').localeCompare(getStr(b.row, '内涝编号'), 'zh-Hans-CN'),
    )
  // 影响范围超出边界的单独提出：终态的留在历史，仍在处置的进越界清单。
  const outOfBoundary = views.filter(
    (item) =>
      item.priority.outOfBoundary &&
      (String(item.row.status) === '待处置' || String(item.row.status) === '处置中'),
  )
  const active = views.filter(
    (item) => String(item.row.status) === '处置中' && !item.priority.outOfBoundary,
  )
  const history = views.filter((item) =>
    ['已退水', '已升级'].includes(String(item.row.status)),
  )
  return { pending, outOfBoundary, active, history }
}

/** 内涝详情：内涝编号唯一取数，结论与列表同源。 */
export function waterlogDetail(code: string): WaterlogView | undefined {
  const row = getWaterlogByCode(code)
  return row ? toView(row) : undefined
}

/**
 * 归队看板：看板不再自己推优先级。
 * 凡关联内涝编号的任务，优先级一律回到本文件按编号取（派队快照），保证与列表、详情相同。
 */
export type RescueView = {
  row: EntryRow
  linkedCode: string
  linkedPriority: DerivedPriority | null
}

export function rescueBoard(): {
  waiting: RescueView[]
  rescuing: RescueView[]
  returning: RescueView[]
  returned: RescueView[]
  stopped: RescueView[]
} {
  const toRescueView = (row: EntryRow): RescueView => {
    const code = getStr(row, '来源内涝编号')
    const linked = code ? getWaterlogByCode(code) : undefined
    return { row, linkedCode: code, linkedPriority: linked ? resolvePriority(linked) : null }
  }
  const views = rescues().map(toRescueView)
  const pick = (status: string) => views.filter((item) => String(item.row.status) === status)
  return {
    waiting: pick('待派队'),
    rescuing: pick('抢险中'),
    returning: pick('待归队'),
    returned: pick('已归队'),
    stopped: pick('已终止'),
  }
}

/** 看板/任务按内涝编号回查派队优先级的唯一入口。 */
export function priorityOfCode(code: string): DerivedPriority | null {
  const row = getWaterlogByCode(code)
  return row ? resolvePriority(row) : null
}

// ---------------------------------------------------------------------------
// 指标
// ---------------------------------------------------------------------------

export function waterlogStats(): {
  pendingCount: number
  rescuingCount: number
  returningCount: number
  monthRecededCount: number
  outOfBoundaryCount: number
} {
  const month = today().slice(0, 7)
  const rows = waterlogs()
  const queue = waterlogQueue()
  return {
    pendingCount: rows.filter((row) => String(row.status) === '待处置').length,
    rescuingCount: rows.filter((row) => String(row.status) === '处置中').length,
    returningCount: rescues().filter((row) => String(row.status) === '待归队').length,
    monthRecededCount: rows.filter(
      (row) => String(row.status) === '已退水' && getStr(row, '退水时间').startsWith(month),
    ).length,
    outOfBoundaryCount: queue.outOfBoundary.length,
  }
}
