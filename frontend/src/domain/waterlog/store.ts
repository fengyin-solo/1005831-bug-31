import { ALGO_VERSION, evaluatePriority } from './priority'
import type {
  PriorityResult,
  RecallStatus,
  RecallTask,
  WaterlogRecord,
  WaterlogStatus,
} from './types'

/**
 * 内涝处置统一存储：三个入口（列表 / 详情 / 归队看板）只从这一份数据取数。
 * 规则全部收口在这里：
 * - 内涝编号唯一，重复上报只落一条；
 * - 处置状态沿「待处置 → 处置中 → 已退水 / 已升级」单向推进，禁止回退；
 * - 派队瞬间冻结优先级快照，历史记录不随算法调整重算；
 * - 退水结论落入抢险队待归队清单，原记录结论保持当时。
 */
const STORAGE_KEY = 'drainage-pump:waterlog-domain-v1'

function snapshot(
  r: Pick<WaterlogRecord, 'depthCm' | 'affectedAreaM2' | 'affectedPeople' | 'lng' | 'lat' | 'radiusM'>,
): PriorityResult {
  return evaluatePriority({
    depthCm: r.depthCm,
    affectedAreaM2: r.affectedAreaM2,
    affectedPeople: r.affectedPeople,
    lng: r.lng,
    lat: r.lat,
    radiusM: r.radiusM,
  })
}

/** 旧版本算法留下的历史快照：只用于演示「已派队记录不随新版本重算」。 */
function legacySnapshot(partial: Partial<PriorityResult>): PriorityResult {
  return {
    algoVersion: 'dispatch-2026.09-v0',
    depthCm: 0,
    depthGrade: 1,
    affectedAreaM2: 0,
    areaGrade: 1,
    affectedPeople: 0,
    peopleGrade: 1,
    rankScore: 0,
    level: 'P3',
    boundary: '界内',
    ...partial,
  }
}

type WaterlogSeed = WaterlogRecord
type RecallSeed = RecallTask

function buildSeed(): { waterlog: WaterlogSeed[]; recall: RecallSeed[] } {
  // 历史已派队记录：快照停留在派队当时的算法结论，收拢算法后也不重算。
  const history05: WaterlogSeed = {
    id: 5,
    code: 'WL-2026-0828-07',
    site: '建设大街与槐安路桥下',
    lng: 120.004,
    lat: 30.006,
    radiusM: 40,
    depthCm: 28,
    affectedAreaM2: 1500,
    affectedPeople: 900,
    status: '处置中',
    team: '抢险二队',
    reportCount: 1,
    firstReportAt: '2026-08-28 19:12',
    lastReportAt: '2026-08-28 19:12',
    dispatchedAt: '2026-08-28 19:40',
    arrivedAt: '2026-08-28 20:05',
    recededAt: '',
    prioritySnapshot: legacySnapshot({
      depthCm: 28,
      depthGrade: 1,
      affectedAreaM2: 1500,
      areaGrade: 1,
      affectedPeople: 900,
      peopleGrade: 1,
      // 旧算法只看积水深度：28cm 当时判为 P3，新算法虽为 P2，历史结论照旧。
      rankScore: 100,
      level: 'P3',
    }),
    note: '旧版算法按积水深度派队，结论已冻结',
  }
  const history04: WaterlogSeed = {
    id: 4,
    code: 'WL-2026-0827-03',
    site: '中华北大街下穿隧道',
    lng: 119.996,
    lat: 29.994,
    radiusM: 35,
    depthCm: 30,
    affectedAreaM2: 1200,
    affectedPeople: 600,
    status: '已退水',
    team: '抢险一队',
    reportCount: 2,
    firstReportAt: '2026-08-27 21:05',
    lastReportAt: '2026-08-27 22:10',
    dispatchedAt: '2026-08-27 21:30',
    arrivedAt: '2026-08-27 21:55',
    recededAt: '2026-08-28 06:10',
    prioritySnapshot: legacySnapshot({
      depthCm: 30,
      depthGrade: 2,
      affectedAreaM2: 1200,
      areaGrade: 1,
      affectedPeople: 600,
      peopleGrade: 1,
      rankScore: 200,
      level: 'P2',
    }),
    note: '重复上报 2 次只落一条；退水结论已随队归队归档',
  }
  const waterlog: WaterlogSeed[] = [
    history04,
    history05,
    {
      id: 3,
      code: 'WL-2026-1004-11',
      site: '裕华东路高速辅路',
      lng: 120.006,
      lat: 30.004,
      radiusM: 50,
      depthCm: 42,
      affectedAreaM2: 2600,
      affectedPeople: 1800,
      status: '处置中',
      team: '抢险一队',
      reportCount: 1,
      firstReportAt: '2026-10-04 21:12',
      lastReportAt: '2026-10-04 21:12',
      dispatchedAt: '2026-10-04 21:40',
      arrivedAt: '2026-10-04 22:02',
      recededAt: '',
      prioritySnapshot: snapshot({
        depthCm: 42,
        affectedAreaM2: 2600,
        affectedPeople: 1800,
        lng: 120.006,
        lat: 30.004,
        radiusM: 50,
      }),
      note: '',
    },
    {
      id: 2,
      code: 'WL-2026-1005-02',
      site: '解放广场南侧路段',
      lng: 119.998,
      lat: 29.992,
      radiusM: 60,
      depthCm: 62,
      affectedAreaM2: 8000,
      affectedPeople: 5200,
      status: '待处置',
      team: '',
      reportCount: 1,
      firstReportAt: '2026-10-05 07:35',
      lastReportAt: '2026-10-05 07:35',
      dispatchedAt: '',
      arrivedAt: '',
      recededAt: '',
      prioritySnapshot: null,
      note: '',
    },
    {
      id: 1,
      code: 'WL-2026-1005-01',
      site: '和平路高架东入口',
      lng: 120.002,
      lat: 30.002,
      radiusM: 30,
      depthCm: 18,
      affectedAreaM2: 600,
      affectedPeople: 120,
      status: '待处置',
      team: '',
      reportCount: 1,
      firstReportAt: '2026-10-05 07:02',
      lastReportAt: '2026-10-05 07:02',
      dispatchedAt: '',
      arrivedAt: '',
      recededAt: '',
      prioritySnapshot: null,
      note: '',
    },
    {
      id: 6,
      code: 'WL-2026-1005-05',
      site: '南二环与仓兴街交口',
      lng: 120.0,
      lat: 29.995,
      radiusM: 25,
      depthCm: 35,
      affectedAreaM2: 500,
      affectedPeople: 80,
      status: '待处置',
      team: '',
      reportCount: 1,
      firstReportAt: '2026-10-05 08:10',
      lastReportAt: '2026-10-05 08:10',
      dispatchedAt: '',
      arrivedAt: '',
      recededAt: '',
      prioritySnapshot: null,
      note: '',
    },
    {
      // 点位本身落在辖区外：影响范围超出边界，单独提出、走移交，不进正常派队队列。
      id: 7,
      code: 'WL-2026-1005-09',
      site: '市界外迎宾大道（跨市路段）',
      lng: 119.987,
      lat: 29.986,
      radiusM: 120,
      depthCm: 55,
      affectedAreaM2: 6000,
      affectedPeople: 3200,
      status: '待处置',
      team: '',
      reportCount: 1,
      firstReportAt: '2026-10-05 08:25',
      lastReportAt: '2026-10-05 08:25',
      dispatchedAt: '',
      arrivedAt: '',
      recededAt: '',
      prioritySnapshot: null,
      note: '影响范围超出辖区边界，需移交相邻辖区协同处置',
    },
    {
      id: 8,
      code: 'WL-2026-1004-18',
      site: '火车站西广场地下通道',
      lng: 120.009,
      lat: 29.997,
      radiusM: 45,
      depthCm: 48,
      affectedAreaM2: 3200,
      affectedPeople: 2400,
      status: '已退水',
      team: '抢险三队',
      reportCount: 1,
      firstReportAt: '2026-10-04 23:05',
      lastReportAt: '2026-10-04 23:05',
      dispatchedAt: '2026-10-04 23:25',
      arrivedAt: '2026-10-04 23:50',
      recededAt: '2026-10-05 05:40',
      prioritySnapshot: snapshot({
        depthCm: 48,
        affectedAreaM2: 3200,
        affectedPeople: 2400,
        lng: 120.009,
        lat: 29.997,
        radiusM: 45,
      }),
      note: '已退水，抢险三队待归队',
    },
  ]

  const recall: RecallSeed[] = [
    {
      id: 1,
      waterlogCode: history04.code,
      site: history04.site,
      team: history04.team,
      status: '已归队',
      recededAt: history04.recededAt,
      returnedAt: '2026-08-29 09:30',
      // 归队清单持有的是退水当时的结论，历史归档不再改动。
      prioritySnapshot: legacySnapshot({
        depthCm: 30,
        depthGrade: 2,
        affectedAreaM2: 1200,
        areaGrade: 1,
        affectedPeople: 600,
        peopleGrade: 1,
        rankScore: 200,
        level: 'P2',
      }),
      note: '历史记录保持当时结论',
    },
    {
      id: 2,
      waterlogCode: 'WL-2026-1004-18',
      site: '火车站西广场地下通道',
      team: '抢险三队',
      status: '待归队',
      recededAt: '2026-10-05 05:40',
      returnedAt: '',
      prioritySnapshot: snapshot({
        depthCm: 48,
        affectedAreaM2: 3200,
        affectedPeople: 2400,
        lng: 120.009,
        lat: 29.997,
        radiusM: 45,
      }),
      note: '内涝退水结论落入待归队清单',
    },
  ]
  return { waterlog, recall }
}

export type DomainState = {
  waterlog: WaterlogRecord[]
  recall: RecallTask[]
  nextWaterlogId: number
  nextRecallId: number
}

export type ActionOutput = {
  ok: boolean
  message: string
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function seedState(): DomainState {
  const seed = buildSeed()
  return {
    waterlog: seed.waterlog,
    recall: seed.recall,
    nextWaterlogId: 9,
    nextRecallId: 3,
  }
}

function readState(): DomainState {
  if (typeof window === 'undefined' || !window.localStorage) {
    return seedState()
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    const seed = seedState()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed))
    return seed
  }
  try {
    const parsed = JSON.parse(raw) as DomainState
    return { ...seedState(), ...parsed }
  } catch {
    const seed = seedState()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed))
    return seed
  }
}

let cache: DomainState | null = null

function state(): DomainState {
  if (cache === null) {
    cache = readState()
  }
  return cache
}

function persist(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state()))
  }
}

function nowText(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function resetDemo(): DomainState {
  cache = seedState()
  persist()
  return clone(cache)
}

// ---- 取数：三个入口都只允许走下面这些读接口，拿到的优先级天然一致 ----

export function listWaterlog(): WaterlogRecord[] {
  return clone(state().waterlog)
}

export function getWaterlog(code: string): WaterlogRecord | undefined {
  return clone(state().waterlog.find((item) => item.code === code))
}

export function listRecall(): RecallTask[] {
  return clone(state().recall)
}

// ---- 上报：内涝编号唯一，重复上报只落一条 ----

export type ReportInput = {
  code: string
  site: string
  lng: number
  lat: number
  radiusM: number
  depthCm: number
  affectedAreaM2: number
  affectedPeople: number
  note?: string
}

const TERMINAL_STATUS: WaterlogStatus[] = ['已退水', '已升级']

export function reportWaterlog(input: ReportInput): { merged: boolean; record: WaterlogRecord } & ActionOutput {
  const code = input.code.trim()
  const rows = state().waterlog
  const existing = rows.find((item) => item.code === code)
  if (existing) {
    // 重复上报：始终只落一条，累加次数、刷新最近上报时间。
    existing.reportCount += 1
    existing.lastReportAt = nowText()
    if (input.site.trim()) {
      existing.site = input.site.trim()
    }
    if (!TERMINAL_STATUS.includes(existing.status)) {
      // 未结案的点位用最新上报数据更新测算口径；待处置记录没有快照，下一次取数即为新结论。
      existing.depthCm = input.depthCm
      existing.affectedAreaM2 = input.affectedAreaM2
      existing.affectedPeople = input.affectedPeople
      existing.lng = input.lng
      existing.lat = input.lat
      existing.radiusM = input.radiusM
      existing.note = input.note?.trim() ?? existing.note
    }
    persist()
    return {
      ok: true,
      merged: true,
      record: clone(existing),
      message: `内涝编号 ${code} 已存在，第 ${existing.reportCount} 次上报并入同一条记录`,
    }
  }

  const record: WaterlogRecord = {
    id: state().nextWaterlogId++,
    code,
    site: input.site.trim(),
    lng: input.lng,
    lat: input.lat,
    radiusM: Math.max(0, input.radiusM),
    depthCm: Math.max(0, input.depthCm),
    affectedAreaM2: Math.max(0, input.affectedAreaM2),
    affectedPeople: Math.max(0, input.affectedPeople),
    status: '待处置',
    team: '',
    reportCount: 1,
    firstReportAt: nowText(),
    lastReportAt: nowText(),
    dispatchedAt: '',
    arrivedAt: '',
    recededAt: '',
    prioritySnapshot: null,
    note: input.note?.trim() ?? '',
  }
  rows.push(record)
  persist()
  return {
    ok: true,
    merged: false,
    record: clone(record),
    message: `内涝编号 ${code} 首报已登记`,
  }
}

// ---- 状态机：单向推进，任何回退或越级都拒绝 ----

const FORWARD_RULES: Record<WaterlogStatus, WaterlogStatus[]> = {
  待处置: ['处置中', '已升级'],
  处置中: ['已退水', '已升级'],
  已退水: [],
  已升级: [],
}

function transition(code: string, target: WaterlogStatus): ActionOutput & { record?: WaterlogRecord } {
  const rows = state().waterlog
  const record = rows.find((item) => item.code === code)
  if (!record) {
    return { ok: false, message: `没有找到内涝编号 ${code}` }
  }
  if (record.status === target) {
    return { ok: false, message: `内涝点 ${code} 已经是「${target}」，无需重复操作` }
  }
  if (!FORWARD_RULES[record.status].includes(target)) {
    return {
      ok: false,
      message: `处置状态只能单向推进：「${record.status}」不能改为「${target}」`,
    }
  }
  record.status = target
  persist()
  return { ok: true, message: `内涝点 ${code} 已推进到「${target}」`, record: clone(record) }
}

/** 派出处置：仅界内待处置点位可派，派队瞬间冻结优先级快照，之后不重算。 */
export function dispatchWaterlog(code: string, team: string): ActionOutput {
  const record = state().waterlog.find((item) => item.code === code)
  if (!record) {
    return { ok: false, message: `没有找到内涝编号 ${code}` }
  }
  if (record.status !== '待处置') {
    return {
      ok: false,
      message: `处置状态只能单向推进：「${record.status}」不能改为「处置中」`,
    }
  }
  const live = snapshot(record)
  if (live.boundary === '超出边界') {
    return {
      ok: false,
      message: '影响范围超出辖区边界，已单独提出，请先按越界点位上报移交，不进入正常派队队列',
    }
  }
  const stamp = nowText()
  record.status = '处置中'
  record.team = team.trim() || record.team
  record.dispatchedAt = stamp
  record.arrivedAt = stamp
  record.prioritySnapshot = live
  persist()
  return {
    ok: true,
    message: `${record.team} 已派出，派队结论 ${live.level}（${live.rankScore} 分，算法 ${live.algoVersion}）已冻结，历史记录不再重算`,
  }
}

/** 确认退水：处置中 → 已退水，并把退水当时结论落入抢险队待归队清单。 */
export function recedeWaterlog(code: string): ActionOutput {
  const record = state().waterlog.find((item) => item.code === code)
  if (!record) {
    return { ok: false, message: `没有找到内涝编号 ${code}` }
  }
  if (record.status !== '处置中') {
    return {
      ok: false,
      message: `处置状态只能单向推进：「${record.status}」不能改为「已退水」`,
    }
  }
  const stamp = nowText()
  record.status = '已退水'
  record.recededAt = stamp
  if (!record.prioritySnapshot) {
    // 正常经由派队进入处置中的记录必有快照；兜底补一份，结论仍以退水当时为准。
    record.prioritySnapshot = snapshot(record)
  }
  // 幂等：同一内涝编号只生成一条待归队结论，重复确认退水不会再落一条。
  const exists = state().recall.some((item) => item.waterlogCode === code)
  if (!exists) {
    state().recall.push({
      id: state().nextRecallId++,
      waterlogCode: code,
      site: record.site,
      team: record.team,
      status: '待归队',
      recededAt: stamp,
      returnedAt: '',
      prioritySnapshot: clone(record.prioritySnapshot),
      note: '内涝退水结论落入待归队清单',
    })
  }
  persist()
  return { ok: true, message: `内涝点 ${code} 已退水，退水结论已落入 ${record.team} 的待归队清单` }
}

/** 上报升级：越界点位或处置中的点位可升级移交。 */
export function escalateWaterlog(code: string): ActionOutput {
  return transition(code, '已升级')
}

/** 确认归队：只动抢险队清单（待归队 → 已归队），内涝侧退水结论保持不变。 */
export function confirmReturn(recallId: number): ActionOutput {
  const task = state().recall.find((item) => item.id === recallId)
  if (!task) {
    return { ok: false, message: `没有找到待归队条目 ${recallId}` }
  }
  if (task.status === '已归队') {
    return { ok: false, message: `${task.team} 已归队，无需重复确认` }
  }
  const allowed: Record<RecallStatus, RecallStatus[]> = { 待归队: ['已归队'], 已归队: [] }
  if (!allowed[task.status].includes('已归队')) {
    return { ok: false, message: '归队状态只能由待归队单向推进到已归队' }
  }
  task.status = '已归队'
  task.returnedAt = nowText()
  persist()
  return { ok: true, message: `${task.team} 已确认归队，退水时的结论归档保留` }
}

export const CURRENT_ALGO_VERSION = ALGO_VERSION
