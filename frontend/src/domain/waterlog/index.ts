/** 内涝派队算法收口：三个入口只允许从这里取数。 */
export * from './types'
export {
  ALGO_VERSION,
  JURISDICTION_BOUNDARY,
  classifyArea,
  classifyBoundary,
  classifyDepth,
  classifyPeople,
  evaluatePriority,
  haversineM,
} from './priority'
export {
  CURRENT_ALGO_VERSION,
  confirmReturn,
  dispatchWaterlog,
  escalateWaterlog,
  listRecall,
  listWaterlog,
  recedeWaterlog,
  reportWaterlog,
  resetDemo,
  getWaterlog,
} from './store'
export type { ActionOutput, DomainState, ReportInput } from './store'
export {
  dispatchQueue,
  effectivePriority,
  getWaterlogView,
  recallBoard,
  toView,
} from './queue'
export type { QueueSection, WaterlogView } from './queue'
