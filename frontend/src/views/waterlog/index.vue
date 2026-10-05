<template>
  <section class="page" data-module="waterlog">
    <header class="page-head">
      <div>
        <h2>内涝点处置 · 派队队列</h2>
        <p class="page-desc">
          内涝编号是唯一入口，积水深度与影响范围由统一派队算法推算；本列表、详情页、归队看板取同一份结论。
          当前算法版本：{{ algoVersion }}
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="showForm = !showForm">
          {{ showForm ? '收起登记表' : '上报内涝点位' }}
        </button>
        <button class="btn" type="button" @click="resetData">恢复演示数据</button>
      </div>
    </header>

    <div class="stat-row">
      <article class="stat-card">
        <span class="stat-label">待派队（界内）</span>
        <strong class="stat-value">{{ queue.pending.length }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">影响范围超出边界</span>
        <strong class="stat-value warn">{{ queue.outOfBoundary.length }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">处置中</span>
        <strong class="stat-value">{{ handlingCount }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">已退水 / 待归队</span>
        <strong class="stat-value">{{ recededCount }}</strong>
      </article>
    </div>

    <form v-if="showForm" class="report-form" @submit.prevent="submitReport">
      <p class="form-title">内涝上报（同一内涝编号重复上报只落一条，自动并入）</p>
      <div class="form-grid">
        <label class="filter-item">
          <span>内涝编号 *</span>
          <input v-model="form.code" placeholder="如 WL-2026-1005-10" />
        </label>
        <label class="filter-item">
          <span>内涝点位 *</span>
          <input v-model="form.site" placeholder="如 XX 路与 XX 街交口" />
        </label>
        <label class="filter-item">
          <span>经度</span>
          <input v-model.number="form.lng" type="number" step="0.0001" />
        </label>
        <label class="filter-item">
          <span>纬度</span>
          <input v-model.number="form.lat" type="number" step="0.0001" />
        </label>
        <label class="filter-item">
          <span>影响半径(米)</span>
          <input v-model.number="form.radiusM" type="number" min="0" />
        </label>
        <label class="filter-item">
          <span>积水深度(厘米)</span>
          <input v-model.number="form.depthCm" type="number" min="0" />
        </label>
        <label class="filter-item">
          <span>影响面积(㎡)</span>
          <input v-model.number="form.affectedAreaM2" type="number" min="0" />
        </label>
        <label class="filter-item">
          <span>影响人口(人)</span>
          <input v-model.number="form.affectedPeople" type="number" min="0" />
        </label>
        <label class="filter-item wide">
          <span>备注</span>
          <input v-model="form.note" placeholder="选填" />
        </label>
      </div>
      <div class="form-foot">
        <button class="btn primary" type="submit">提交上报</button>
      </div>
    </form>

    <p v-if="message" :class="messageOk ? 'ok-text' : 'error-text'">{{ message }}</p>

    <section class="queue-block">
      <h3 class="block-title">待派队队列（界内，按统一优先级从高到低）</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>派队顺位</th>
            <th>优先级</th>
            <th>内涝编号</th>
            <th>内涝点位</th>
            <th>积水深度(cm)</th>
            <th>影响面积(㎡)</th>
            <th>影响人口</th>
            <th>边界</th>
            <th>上报次数</th>
            <th>处置状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in queue.pending" :key="row.code">
            <td>{{ index + 1 }}</td>
            <td><span class="prio-badge" :class="`prio-${row.priority.level}`">{{ row.priority.level }}</span><span class="score">{{ row.priority.rankScore }}分</span></td>
            <td><RouterLink class="link" :to="`/waterlog/${encodeURIComponent(row.code)}`">{{ row.code }}</RouterLink></td>
            <td>{{ row.site }}</td>
            <td>{{ row.depthCm }}</td>
            <td>{{ row.affectedAreaM2 }}</td>
            <td>{{ row.affectedPeople }}</td>
            <td><span class="tag in">{{ row.priority.boundary }}</span></td>
            <td>{{ row.reportCount }}</td>
            <td>{{ row.status }}</td>
            <td class="row-actions">
              <button class="link" type="button" @click="openDispatch(row)">派出处置</button>
              <button class="link danger" type="button" @click="escalate(row.code)">上报升级</button>
            </td>
          </tr>
          <tr v-if="!queue.pending.length">
            <td colspan="11" class="empty-state">界内暂无待派队内涝点位</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="queue-block">
      <h3 class="block-title warn-title">影响范围超出边界 · 单独提出（移交相邻辖区，不进正常派队队列）</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>优先级（移交参考）</th>
            <th>内涝编号</th>
            <th>内涝点位</th>
            <th>积水深度(cm)</th>
            <th>影响面积(㎡)</th>
            <th>影响半径(米)</th>
            <th>处置状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in queue.outOfBoundary" :key="row.code" class="row-warn">
            <td><span class="prio-badge" :class="`prio-${row.priority.level}`">{{ row.priority.level }}</span><span class="score">{{ row.priority.rankScore }}分</span></td>
            <td><RouterLink class="link" :to="`/waterlog/${encodeURIComponent(row.code)}`">{{ row.code }}</RouterLink></td>
            <td>{{ row.site }}</td>
            <td>{{ row.depthCm }}</td>
            <td>{{ row.affectedAreaM2 }}</td>
            <td>{{ row.radiusM }}</td>
            <td>{{ row.status }}</td>
            <td class="row-actions">
              <button class="link danger" type="button" @click="escalate(row.code)">上报升级 / 移交</button>
            </td>
          </tr>
          <tr v-if="!queue.outOfBoundary.length">
            <td colspan="8" class="empty-state">暂无超出边界的内涝点位</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="queue-block">
      <h3 class="block-title">已派队记录（优先级为派队当时冻结快照，调整算法不重算）</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>内涝编号</th>
            <th>内涝点位</th>
            <th>处置队</th>
            <th>优先级</th>
            <th>算法版本</th>
            <th>积水深度(cm)</th>
            <th>影响面积(㎡)</th>
            <th>处置状态</th>
            <th>派队时间</th>
            <th>退水时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in queue.dispatched" :key="row.code">
            <td><RouterLink class="link" :to="`/waterlog/${encodeURIComponent(row.code)}`">{{ row.code }}</RouterLink></td>
            <td>{{ row.site }}</td>
            <td>{{ row.team || '—' }}</td>
            <td><span class="prio-badge" :class="`prio-${row.priority.level}`">{{ row.priority.level }}</span><span class="score">{{ row.priority.rankScore }}分</span></td>
            <td><span class="version">{{ row.priority.algoVersion }}</span></td>
            <td>{{ row.priority.depthCm }}</td>
            <td>{{ row.priority.affectedAreaM2 }}</td>
            <td>{{ row.status }}</td>
            <td>{{ row.dispatchedAt || '—' }}</td>
            <td>{{ row.recededAt || '—' }}</td>
            <td class="row-actions">
              <button v-if="row.status === '处置中'" class="link" type="button" @click="recede(row.code)">确认退水</button>
              <button v-if="row.status === '处置中'" class="link danger" type="button" @click="escalate(row.code)">上报升级</button>
              <span v-if="row.status === '已退水'" class="muted">结论已入待归队清单</span>
              <span v-if="row.status === '已升级'" class="muted">已移交升级</span>
            </td>
          </tr>
          <tr v-if="!queue.dispatched.length">
            <td colspan="11" class="empty-state">暂无已派队记录</td>
          </tr>
        </tbody>
      </table>
    </section>

    <dialog v-if="dispatchTarget" ref="dispatchDialog" class="dispatch-dialog" open>
      <form method="dialog" class="dialog-body" @submit.prevent="confirmDispatch">
        <h3 class="dialog-title">派出处置 · {{ dispatchTarget.code }}</h3>
        <p class="dialog-line">
          统一优先级结论：<b>{{ dispatchTarget.priority.level }}</b>（{{ dispatchTarget.priority.rankScore }} 分，
          深度 {{ dispatchTarget.priority.depthGrade }} 档 / 面积 {{ dispatchTarget.priority.areaGrade }} 档 / 人口 {{ dispatchTarget.priority.peopleGrade }} 档）
        </p>
        <p class="dialog-line muted">派队瞬间冻结该结论，之后算法调整不重算。</p>
        <label class="filter-item">
          <span>处置 / 抢险队</span>
          <select v-model="dispatchTeam">
            <option value="抢险一队">抢险一队</option>
            <option value="抢险二队">抢险二队</option>
            <option value="抢险三队">抢险三队</option>
          </select>
        </label>
        <div class="dialog-actions">
          <button class="btn" type="button" @click="dispatchTarget = null">取消</button>
          <button class="btn primary" type="submit">确认派出</button>
        </div>
      </form>
    </dialog>

    <footer class="page-foot">
      <span>共 {{ totalCount }} 条内涝记录；历史记录保持派队当时结论，不随算法重算</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  CURRENT_ALGO_VERSION,
  dispatchQueue,
  dispatchWaterlog,
  escalateWaterlog,
  recedeWaterlog,
  reportWaterlog,
  resetDemo,
} from '@/domain/waterlog'
import type { QueueSection, WaterlogView } from '@/domain/waterlog'

const algoVersion = CURRENT_ALGO_VERSION
const queue = ref<QueueSection>({ pending: [], outOfBoundary: [], dispatched: [] })
const showForm = ref(false)
const message = ref('')
const messageOk = ref(true)

const emptyForm = () => ({
  code: '',
  site: '',
  lng: 120.0,
  lat: 30.0,
  radiusM: 40,
  depthCm: 0,
  affectedAreaM2: 0,
  affectedPeople: 0,
  note: '',
})
const form = ref(emptyForm())

const dispatchTarget = ref<WaterlogView | null>(null)
const dispatchTeam = ref('抢险一队')

const handlingCount = computed(() => queue.value.dispatched.filter((row) => row.status === '处置中').length)
const recededCount = computed(() => queue.value.dispatched.filter((row) => row.status === '已退水').length)
const totalCount = computed(
  () => queue.value.pending.length + queue.value.outOfBoundary.length + queue.value.dispatched.length,
)

function flash(text: string, ok = true) {
  message.value = text
  messageOk.value = ok
}

function reload() {
  queue.value = dispatchQueue()
}

function submitReport() {
  if (!form.value.code.trim() || !form.value.site.trim()) {
    flash('内涝编号与内涝点位为必填项', false)
    return
  }
  const result = reportWaterlog({ ...form.value })
  flash(result.message, result.ok)
  if (result.ok) {
    form.value = emptyForm()
    showForm.value = false
    reload()
  }
}

function openDispatch(row: WaterlogView) {
  dispatchTarget.value = row
  dispatchTeam.value = '抢险一队'
}

function confirmDispatch() {
  if (!dispatchTarget.value) {
    return
  }
  const result = dispatchWaterlog(dispatchTarget.value.code, dispatchTeam.value)
  flash(result.message, result.ok)
  dispatchTarget.value = null
  reload()
}

function recede(code: string) {
  const result = recedeWaterlog(code)
  flash(result.message, result.ok)
  reload()
}

function escalate(code: string) {
  const result = escalateWaterlog(code)
  flash(result.message, result.ok)
  reload()
}

function resetData() {
  resetDemo()
  reload()
  flash('已恢复演示数据')
}

onMounted(reload)
</script>

<style scoped>
.queue-block { margin: 18px 0 8px; }
.block-title { font-size: 14px; margin: 0 0 8px; }
.warn-title { color: #b54708; }
.score { margin-left: 6px; color: var(--muted); font-size: 12px; }
.version { font-size: 11px; color: var(--muted); background: #eef2f7; border-radius: 4px; padding: 1px 6px; }
.tag { border-radius: 999px; padding: 1px 10px; font-size: 12px; }
.tag.in { background: #e7f6ec; color: #067647; }
.muted { color: var(--muted); font-size: 12px; }
.warn { color: #b54708; }
.row-warn { background: #fffaeb; }
.danger { color: #b42318; }
.ok-text { color: #067647; font-size: 13px; }
.prio-badge { display: inline-block; min-width: 30px; text-align: center; border-radius: 6px; padding: 2px 6px; font-weight: 600; font-size: 12px; color: #fff; }
.prio-P1 { background: #d92d20; }
.prio-P2 { background: #f79009; }
.prio-P3 { background: #12b76a; }
.report-form { background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; margin-bottom: 12px; }
.form-title { margin: 0 0 10px; font-weight: 600; font-size: 13px; }
.form-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.form-grid .wide { grid-column: span 3; }
.form-foot { margin-top: 10px; }
.dispatch-dialog { border: 1px solid var(--border); border-radius: 10px; padding: 0; width: 420px; }
.dialog-body { padding: 18px 20px; margin: 0; }
.dialog-title { margin: 0 0 10px; font-size: 15px; }
.dialog-line { font-size: 13px; margin: 6px 0; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
</style>
