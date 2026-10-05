/** 内涝处置域类型。列表 / 详情 / 归队看板三处共用，禁止各入口再自定义字段。 */

/** 处置状态只能沿「待处置 → 处置中 → 已退水（或已升级）」单向推进。 */
export type WaterlogStatus = '待处置' | '处置中' | '已退水' | '已升级'

/** 抢险任务状态：退水结论落入「待归队」，确认归队后单向进入「已归队」。 */
export type RecallStatus = '待归队' | '已归队'

/** 影响范围与辖区边界的关系。超出边界的点位单独成组，不进正常派队队列。 */
export type BoundaryKind = '界内' | '超出边界'

export type PriorityLevel = 'P1' | 'P2' | 'P3'

/** 派队算法的输入：内涝编号是唯一入口，积水深度与影响范围都从这份数据推算。 */
export type PriorityInput = {
  /** 积水深度，单位厘米（cm）。 */
  depthCm: number
  /** 影响面积，单位平方米（㎡）。 */
  affectedAreaM2: number
  /** 影响人口，单位人。 */
  affectedPeople: number
  /** 点位经度。 */
  lng: number
  /** 点位纬度。 */
  lat: number
  /** 影响半径，单位米（m）；结合点位坐标判定影响范围是否越界。 */
  radiusM: number
}

/** 派队算法的输出：三个入口拿到的都是这一份结论，不允许各算各的。 */
export type PriorityResult = {
  /** 算法版本：已派队的历史记录按快照锁定，不随版本重算。 */
  algoVersion: string
  depthCm: number
  /** 积水深度档位：1 轻度 / 2 中度 / 3 重度。 */
  depthGrade: 1 | 2 | 3
  affectedAreaM2: number
  /** 影响面积档位：1 / 2 / 3。 */
  areaGrade: 1 | 2 | 3
  affectedPeople: number
  peopleGrade: 1 | 2 | 3
  /** 综合派队分值，越大越先派；同值再按上报时间、内涝编号兜底。 */
  rankScore: number
  level: PriorityLevel
  boundary: BoundaryKind
}

/** 内涝点位记录。一条内涝编号只对应一条记录，重复上报落同一条。 */
export type WaterlogRecord = {
  id: number
  /** 内涝编号：唯一业务入口，列表 / 详情 / 看板都凭它取数。 */
  code: string
  site: string
  lng: number
  lat: number
  radiusM: number
  depthCm: number
  affectedAreaM2: number
  affectedPeople: number
  status: WaterlogStatus
  team: string
  /** 第几次上报同一内涝编号；首报为 1，重复上报累加，但始终只落一条。 */
  reportCount: number
  firstReportAt: string
  lastReportAt: string
  dispatchedAt: string
  arrivedAt: string
  recededAt: string
  /** 派队时锁定的优先级快照；待处置记录没有快照，按当前数据实时推算。 */
  prioritySnapshot: PriorityResult | null
  note: string
}

/** 内涝退水后落入抢险队的待归队条目。结论取自内涝记录当时的快照，不回改。 */
export type RecallTask = {
  id: number
  /** 关联内涝编号，归队看板凭它回查同一份优先级结论。 */
  waterlogCode: string
  site: string
  team: string
  status: RecallStatus
  /** 退水结论成立时间，即进入待归队清单的时间。 */
  recededAt: string
  returnedAt: string
  /** 退水当时锁定的优先级结论，后续内涝侧怎么变都不重算。 */
  prioritySnapshot: PriorityResult
  note: string
}
