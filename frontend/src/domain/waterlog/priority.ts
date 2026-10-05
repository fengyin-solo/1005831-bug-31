/**
 * 内涝派队算法——全局唯一实现。
 *
 * 列表、详情、归队看板三个入口都只能调用本文件的 evaluatePriority，
 * 不再允许各自按「积水深度」或「影响范围」单推一遍，避免同一点位三种先后。
 * 算法升级时递增 ALGO_VERSION；已经派过队的历史记录持有的是旧版本快照，不重算。
 */
import type {
  BoundaryKind,
  PriorityInput,
  PriorityLevel,
  PriorityResult,
} from './types'

export const ALGO_VERSION = 'dispatch-2026.10-v1'

/** 市辖区边界（示例数据用，经纬度多边形）。影响范围越过它就要单独提出、移交处置。 */
export const JURISDICTION_BOUNDARY: ReadonlyArray<readonly [number, number]> = [
  [119.990, 30.012],
  [120.014, 30.011],
  [120.013, 29.988],
  [119.989, 29.989],
]

const EARTH_RADIUS_M = 6371000
const toRad = (degree: number): number => (degree * Math.PI) / 180

/** 两个经纬度坐标之间的球面距离（米）。 */
export function haversineM(a: [number, number], b: [number, number]): number {
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(b[0] - a[0])
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** 点到线段的最短球面距离（米）。小范围内平面近似足够，用经纬度等比换算后判定。 */
function distanceToSegmentM(
  point: [number, number],
  start: [number, number],
  end: [number, number],
): number {
  const [px, py] = point
  const [sx, sy] = start
  const [ex, ey] = end
  const dx = ex - sx
  const dy = ey - sy
  const lengthSquared = dx * dx + dy * dy
  let t = lengthSquared === 0 ? 0 : ((px - sx) * dx + (py - sy) * dy) / lengthSquared
  t = Math.max(0, Math.min(1, t))
  const closest: [number, number] = [sx + t * dx, sy + t * dy]
  return haversineM(point, closest)
}

/** 射线法判定点位是否落在多边形内（经纬度小范围平面判定）。 */
function pointInPolygon(point: [number, number], polygon: ReadonlyArray<readonly [number, number]>): boolean {
  const [x, y] = point
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    const crosses =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi
    if (crosses) {
      inside = !inside
    }
  }
  return inside
}

/**
 * 判定影响范围是否超出辖区边界：
 * 1. 点位本身已在界外，直接超出；
 * 2. 点位在界内但影响圆盘半径越过任一边界，同样超出；
 * 3. 否则为界内。
 */
export function classifyBoundary(
  input: Pick<PriorityInput, 'lng' | 'lat' | 'radiusM'>,
  polygon: ReadonlyArray<readonly [number, number]> = JURISDICTION_BOUNDARY,
): BoundaryKind {
  const point: [number, number] = [input.lng, input.lat]
  if (!pointInPolygon(point, polygon)) {
    return '超出边界'
  }
  for (let i = 0; i < polygon.length; i++) {
    const start = polygon[i]
    const end = polygon[(i + 1) % polygon.length]
    if (distanceToSegmentM(point, [start[0], start[1]], [end[0], end[1]]) < input.radiusM) {
      return '超出边界'
    }
  }
  return '界内'
}

/** 积水深度（cm）分档：≥50 重度，25–49 中度，其余轻度。 */
export function classifyDepth(depthCm: number): 1 | 2 | 3 {
  if (depthCm >= 50) {
    return 3
  }
  if (depthCm >= 25) {
    return 2
  }
  return 1
}

/** 影响面积（㎡）分档：≥5000 / 1000–4999 / 其余。 */
export function classifyArea(affectedAreaM2: number): 1 | 2 | 3 {
  if (affectedAreaM2 >= 5000) {
    return 3
  }
  if (affectedAreaM2 >= 1000) {
    return 2
  }
  return 1
}

/** 影响人口（人）分档：≥3000 / 500–2999 / 其余。 */
export function classifyPeople(affectedPeople: number): 1 | 2 | 3 {
  if (affectedPeople >= 3000) {
    return 3
  }
  if (affectedPeople >= 500) {
    return 2
  }
  return 1
}

function levelOf(rankScore: number): PriorityLevel {
  if (rankScore >= 310) {
    return 'P1'
  }
  if (rankScore >= 210) {
    return 'P2'
  }
  return 'P3'
}

/**
 * 派队优先级的唯一推算入口。
 * 积水深度与影响范围（面积、人口、边界）在此合成同一份结论，
 * 三个入口只取这一份，保证同一内涝编号的先后顺序完全一致。
 */
export function evaluatePriority(input: PriorityInput): PriorityResult {
  const depthCm = Math.max(0, input.depthCm)
  const affectedAreaM2 = Math.max(0, input.affectedAreaM2)
  const affectedPeople = Math.max(0, input.affectedPeople)
  const depthGrade = classifyDepth(depthCm)
  const areaGrade = classifyArea(affectedAreaM2)
  const peopleGrade = classifyPeople(affectedPeople)
  // 深度定百位（主因），面积定十位，人口定个位；同值由队列按上报时间、编号兜底。
  const rankScore = depthGrade * 100 + areaGrade * 10 + peopleGrade
  return {
    algoVersion: ALGO_VERSION,
    depthCm,
    depthGrade,
    affectedAreaM2,
    areaGrade,
    affectedPeople,
    peopleGrade,
    rankScore,
    level: levelOf(rankScore),
    boundary: classifyBoundary(input),
  }
}
