<template>
  <section class="page" data-module="waterlog">
    <header class="page-head">
      <div>
        <h2>内涝点处置管理</h2>
        <p class="page-desc">
          内涝编号是唯一入口；积水深度、影响范围与派队优先级由统一派队算法推算，列表、详情、归队看板同源同序。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openReport">上报内涝点位</button>
        <button class="btn" type="button" @click="exportRows">导出内涝点处置清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article class="stat-card">
        <span class="stat-label">待处置内涝点</span>
        <strong class="stat-value">{{ stats.pendingCount }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">处置中内涝点</span>
        <strong class="stat-value">{{ stats.rescuingCount }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">待归队抢险队</span>
        <strong class="stat-value">{{ stats.returningCount }}</strong>
      </article>
      <article class="stat-card stat-warn">
        <span class="stat-label">影响范围越界 · 单独提级</span>
        <strong class="stat-value">{{ stats.outOfBoundaryCount }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">本月退水数</span>
        <strong class="stat-value">{{ stats.monthRecededCount }}</strong>
      </article>
    </div>

    <form class="filter-bar" @submit.prevent="reload">
      <label class="filter-item">
        <span>按内涝编号 / 点位检索</span>
        <input v-model="keyword" placeholder="输入内涝编号或点位关键字" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="keyword = ''">重置条件</button>
    </form>

    <!-- 影响范围超出责任边界：单独提出，不进正常派队队列 -->
    <section class="queue-block queue-alert">
      <h3 class="queue-title">越界提级清单（{{ queue.outOfBoundary.length }}）· 已从正常派队队列剔除</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>派队序</th><th>内涝编号</th><th>内涝点位</th><th>积水深度</th>
            <th>影响范围</th><th>责任边界 / 上限</th><th>派队优先级</th><th>处置状态</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, index) in filtered(queue.outOfBoundary)" :key="String(item.row.id)">
            <td>提级 {{ index + 1 }}</td>
            <td><RouterLink class="link" :to="detailPath(item)">{{ val(item, '内涝编号') }}</RouterLink></td>
            <td>{{ val(item, '内涝点位') }}</td>
            <td>{{ item.priority.depthCm }}cm · {{ item.priority.depthLevel }}</td>
            <td class="cell-warn">
              {{ item.priority.areaM2 }}㎡ · {{ item.priority.areaLevel }}
              <div class="cell-note">{{ val(item, '越界说明') }}</div>
            </td>
            <td>{{ item.priority.boundaryName }} / {{ item.priority.boundaryLimit }}㎡</td>
            <td>
              <span class="priority-tag" :class="priorityClass(item.priority.priorityLevel)">
                {{ item.priority.priorityLevel }}（{{ item.priority.score }}）
              </span>
              <div class="cell-note">{{ item.priority.basis }}</div>
            </td>
            <td>{{ item.row.status }}</td>
            <td class="row-actions">
              <button v-if="item.row.status === '待处置'" class="link" type="button" @click="openDispatch(item.row)">
                派出处置
              </button>
              <button
                v-if="item.row.status === '待处置' || item.row.status === '处置中'"
                class="link"
                type="button"
                @click="doEscalate(item.row)"
              >
                上报升级
              </button>
              <button v-if="item.row.status === '处置中'" class="link" type="button" @click="doRecede(item.row)">
                确认退水
              </button>
            </td>
          </tr>
          <tr v-if="!filtered(queue.outOfBoundary).length">
            <td colspan="9" class="empty-state">暂无影响范围超出边界的内涝点位</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- 正常派队队列：顺序即统一算法给出的优先级 -->
    <section class="queue-block">
      <h3 class="queue-title">待处置派队队列（{{ queue.pending.length }}）· 按统一派队算法排序</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>派队序</th><th>内涝编号</th><th>内涝点位</th><th>积水深度</th>
            <th>影响范围</th><th>责任边界 / 上限</th><th>派队优先级</th><th>处置状态</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, index) in filtered(queue.pending)" :key="String(item.row.id)">
            <td>{{ index + 1 }}</td>
            <td><RouterLink class="link" :to="detailPath(item)">{{ val(item, '内涝编号') }}</RouterLink></td>
            <td>{{ val(item, '内涝点位') }}</td>
            <td>{{ item.priority.depthCm }}cm · {{ item.priority.depthLevel }}</td>
            <td>{{ item.priority.areaM2 }}㎡ · {{ item.priority.areaLevel }}</td>
            <td>{{ item.priority.boundaryName }} / {{ item.priority.boundaryLimit }}㎡</td>
            <td>
              <span class="priority-tag" :class="priorityClass(item.priority.priorityLevel)">
                {{ item.priority.priorityLabel }}
              </span>
              <div class="cell-note">评分 {{ item.priority.score }}（深 0.6 / 范围 0.4）</div>
            </td>
            <td>{{ item.row.status }}</td>
            <td class="row-actions">
              <button class="link" type="button" @click="openDispatch(item.row)">派出处置</button>
              <button class="link" type="button" @click="doEscalate(item.row)">上报升级</button>
            </td>
          </tr>
          <tr v-if="!filtered(queue.pending).length">
            <td colspan="9" class="empty-state">暂无待处置内涝点位</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- 处置中 + 历史：已派队记录读冻结快照，不重算 -->
    <section class="queue-block">
      <h3 class="queue-title">处置中与历史记录（{{ queue.active.length + queue.history.length }}）· 派队结论已冻结，不重算</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>内涝编号</th><th>内涝点位</th><th>积水深度（派队时）</th>
            <th>影响范围（派队时）</th><th>处置队</th><th>派队优先级</th>
            <th>处置状态</th><th>结论来源</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in filtered([...queue.active, ...queue.history])" :key="String(item.row.id)">
            <td><RouterLink class="link" :to="detailPath(item)">{{ val(item, '内涝编号') }}</RouterLink></td>
            <td>{{ val(item, '内涝点位') }}</td>
            <td>{{ item.priority.depthCm }}cm · {{ item.priority.depthLevel }}</td>
            <td>{{ item.priority.areaM2 }}㎡ · {{ item.priority.areaLevel }}</td>
            <td>{{ val(item, '处置队') || '—' }}</td>
            <td>
              <span class="priority-tag" :class="priorityClass(item.priority.priorityLevel)">
                {{ item.priority.priorityLevel }}
              </span>
            </td>
            <td>{{ item.row.status }}</td>
            <td>
              {{ item.priority.basis }}
              <div v-if="item.priority.frozenAt" class="cell-note">冻结于 {{ item.priority.frozenAt }}</div>
            </td>
            <td class="row-actions">
              <button v-if="item.row.status === '处置中'" class="link" type="button" @click="doRecede(item.row)">
                确认退水
              </button>
              <button v-if="item.row.status === '处置中'" class="link" type="button" @click="doEscalate(item.row)">
                上报升级
              </button>
            </td>
          </tr>
          <tr v-if="!filtered([...queue.active, ...queue.history]).length">
            <td colspan="9" class="empty-state">暂无处置中或历史内涝记录</td>
          </tr>
        </tbody>
      </table>
    </section>

    <footer class="page-foot">
      <span>共 {{ total }} 条内涝点记录 · 优先级只认统一派队算法这一份</span>
      <span v-if="message" :class="messageOk ? 'ok-text' : 'error-text'">{{ message }}</span>
    </footer>

    <!-- 上报弹窗：同一内涝编号重复上报只落一条 -->
    <div v-if="reportOpen" class="modal-mask" @click.self="reportOpen = false">
      <form class="modal" @submit.prevent="submitReport">
        <h3>上报内涝点位</h3>
        <p class="cell-note">内涝编号是唯一入口；编号重复时只更新原有待处置记录，不会新增第二条。</p>
        <label class="form-item"><span>内涝编号 *</span><input v-model="reportForm.code" placeholder="如 WATE-0010" /></label>
        <label class="form-item"><span>内涝点位 *</span><input v-model="reportForm.site" placeholder="点位名称 / 地址" /></label>
        <label class="form-item">
          <span>积水深度 (cm) *</span>
          <input v-model.number="reportForm.depthCm" type="number" min="0" step="1" />
        </label>
        <label class="form-item">
          <span>影响范围 (㎡) *</span>
          <input v-model.number="reportForm.areaM2" type="number" min="0" step="10" />
        </label>
        <label class="form-item">
          <span>责任边界 *</span>
          <select v-model="reportForm.boundary">
            <option v-for="name in boundaryNames" :key="name" :value="name">{{ name }}</option>
          </select>
        </label>
        <label class="form-item"><span>上报人</span><input v-model="reportForm.reporter" placeholder="默认值班管理员" /></label>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="reportOpen = false">取消</button>
          <button class="btn primary" type="submit">提交上报</button>
        </div>
      </form>
    </div>

    <!-- 派队弹窗 -->
    <div v-if="dispatchTarget" class="modal-mask" @click.self="dispatchTarget = null">
      <form class="modal" @submit.prevent="submitDispatch">
        <h3>派出处置 · {{ val(dispatchTarget, '内涝编号') }}</h3>
        <p class="cell-note">
          点位：{{ val(dispatchTarget, '内涝点位') }}；派队优先级在派出瞬间冻结，之后算法调整也不重算这条。
        </p>
        <label class="form-item">
          <span>处置队 *</span>
          <select v-model="dispatchTeam">
            <option v-for="name in teamNames" :key="name" :value="name">{{ name }}</option>
          </select>
        </label>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="dispatchTarget = null">取消</button>
          <button class="btn primary" type="submit">确认派出</button>
        </div>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import { downloadEntries, moduleMeta } from '@/api/local-service'
import type { EntryRow } from '@/data/types'
import {
  dispatchWaterlog,
  escalateWaterlog,
  confirmRecede,
  reportWaterlog,
  waterlogQueue,
  waterlogStats,
  type WaterlogView,
} from '@/domain/waterlog'

const meta = moduleMeta('waterlog')
const boundaryNames = ['城东片区', '城西片区', '城南片区', '城北片区', '老城区']
const teamNames = ['抢险一班', '抢险二班', '抢险三班', '抢险四班']

const queue = ref(waterlogQueue())
const stats = ref(waterlogStats())
const keyword = ref('')
const message = ref('')
const messageOk = ref(false)

const total = computed(
  () =>
    queue.value.pending.length +
    queue.value.outOfBoundary.length +
    queue.value.active.length +
    queue.value.history.length,
)

function val(item: EntryRow | WaterlogView, field: string): string {
  const row: EntryRow = 'row' in item ? (item as WaterlogView).row : (item as EntryRow)
  return String(row[field] ?? '').trim()
}

function detailPath(item: WaterlogView): string {
  return `/waterlog/${encodeURIComponent(String(item.row['内涝编号']))}`
}

function priorityClass(level: string): string {
  if (level === '一级') return 'p1'
  if (level === '二级') return 'p2'
  return 'p3'
}

function filtered(items: WaterlogView[]): WaterlogView[] {
  const key = keyword.value.trim()
  if (!key) return items
  return items.filter(
    (item) =>
      val(item, '内涝编号').includes(key) || val(item, '内涝点位').includes(key),
  )
}

function notify(ok: boolean, text: string) {
  messageOk.value = ok
  message.value = text
}

function reload() {
  queue.value = waterlogQueue()
  stats.value = waterlogStats()
}

function exportRows() {
  downloadEntries(meta.key)
}

// ---- 上报 ----
const reportOpen = ref(false)
const reportForm = reactive({
  code: '',
  site: '',
  depthCm: 30,
  areaM2: 300,
  boundary: '城东片区',
  reporter: '值班管理员',
})

function openReport() {
  Object.assign(reportForm, {
    code: '',
    site: '',
    depthCm: 30,
    areaM2: 300,
    boundary: '城东片区',
    reporter: '值班管理员',
  })
  reportOpen.value = true
}

function submitReport() {
  const result = reportWaterlog({
    code: reportForm.code,
    site: reportForm.site,
    depthCm: Number(reportForm.depthCm),
    areaM2: Number(reportForm.areaM2),
    boundary: reportForm.boundary,
    reporter: reportForm.reporter,
  })
  notify(result.ok, result.message)
  if (result.ok) {
    reportOpen.value = false
    reload()
  }
}

// ---- 派队 / 退水 / 升级 ----
const dispatchTarget = ref<EntryRow | null>(null)
const dispatchTeam = ref(teamNames[0])

function openDispatch(row: EntryRow) {
  dispatchTarget.value = row
  dispatchTeam.value = String(row['处置队'] || '').trim() || teamNames[0]
}

function submitDispatch() {
  if (!dispatchTarget.value) return
  const result = dispatchWaterlog(Number(dispatchTarget.value.id), dispatchTeam.value)
  notify(result.ok, result.message)
  if (result.ok) {
    dispatchTarget.value = null
    reload()
  }
}

function doRecede(row: EntryRow) {
  const result = confirmRecede(Number(row.id))
  notify(result.ok, result.message)
  if (result.ok) reload()
}

function doEscalate(row: EntryRow) {
  const result = escalateWaterlog(Number(row.id))
  notify(result.ok, result.message)
  if (result.ok) reload()
}

onMounted(reload)
</script>
