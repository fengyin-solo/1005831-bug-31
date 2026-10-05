<template>
  <section class="page" data-module="waterlog-detail">
    <header class="page-head">
      <div>
        <h2>内涝点详情</h2>
        <p class="page-desc">
          详情页不单独推算：以下积水深度、影响范围与派队优先级全部由统一派队算法按内涝编号取数，与列表、归队看板一致。
        </p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" to="/waterlog">返回内涝列表</RouterLink>
      </div>
    </header>

    <div v-if="!view" class="queue-block">
      <p class="error-text">找不到内涝编号「{{ code }}」对应的记录。</p>
    </div>

    <template v-else>
      <div class="stat-row">
        <article class="stat-card">
          <span class="stat-label">派队优先级</span>
          <strong class="stat-value">
            <span class="priority-tag" :class="priorityClass(view.priority.priorityLevel)">
              {{ view.priority.priorityLabel }}
            </span>
          </strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">综合评分（深 0.6 / 范围 0.4）</span>
          <strong class="stat-value">{{ view.priority.score }} / 3</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">处置状态</span>
          <strong class="stat-value">{{ view.row.status }}</strong>
        </article>
        <article class="stat-card" :class="{ 'stat-warn': view.priority.outOfBoundary }">
          <span class="stat-label">影响范围边界判定</span>
          <strong class="stat-value">{{ view.priority.outOfBoundary ? '超出边界 · 单独提级' : '边界内' }}</strong>
        </article>
      </div>

      <div class="detail-grid">
        <article class="detail-card">
          <h3>基础信息（内涝编号唯一入口）</h3>
          <dl class="detail-list">
            <dt>内涝编号</dt><dd>{{ text('内涝编号') }}</dd>
            <dt>内涝点位</dt><dd>{{ text('内涝点位') }}</dd>
            <dt>责任边界</dt><dd>{{ view.priority.boundaryName }}</dd>
            <dt>上报时间</dt><dd>{{ text('上报时间') || '—' }}</dd>
            <dt>上报人</dt><dd>{{ text('上报人') || '—' }}</dd>
            <dt>处置队</dt><dd>{{ text('处置队') || '尚未派出' }}</dd>
            <dt>派队时间</dt><dd>{{ text('派队时间') || '—' }}</dd>
            <dt>退水时间</dt><dd>{{ text('退水时间') || '—' }}</dd>
          </dl>
        </article>

        <article class="detail-card">
          <h3>积水深度 · 统一推算</h3>
          <dl class="detail-list">
            <dt>实测深度</dt><dd>{{ view.priority.depthCm }} cm</dd>
            <dt>深度分档</dt><dd>{{ view.priority.depthLevel }}（档分 {{ view.priority.depthScore }}）</dd>
          </dl>
        </article>

        <article class="detail-card">
          <h3>影响范围 · 统一推算</h3>
          <dl class="detail-list">
            <dt>实测面积</dt><dd>{{ view.priority.areaM2 }} ㎡</dd>
            <dt>范围分档</dt><dd>{{ view.priority.areaLevel }}（档分 {{ view.priority.areaScore }}）</dd>
            <dt>边界承接上限</dt><dd>{{ view.priority.boundaryLimit }} ㎡</dd>
            <dt>占用比例</dt><dd>{{ (view.priority.occupancyRate * 100).toFixed(1) }}%</dd>
            <dt>越界判定</dt>
            <dd :class="view.priority.outOfBoundary ? 'error-text' : 'ok-text'">
              {{ view.priority.outOfBoundary ? text('越界说明') || '超出责任边界，已单独提级' : '未越界' }}
            </dd>
          </dl>
        </article>

        <article class="detail-card">
          <h3>派队结论 · 三入口同源</h3>
          <dl class="detail-list">
            <dt>优先级</dt><dd>{{ view.priority.priorityLevel }}</dd>
            <dt>综合评分</dt><dd>{{ view.priority.score }}</dd>
            <dt>结论来源</dt>
            <dd>
              {{ view.priority.basis }}
              <div v-if="view.priority.frozenAt" class="cell-note">派队时冻结于 {{ view.priority.frozenAt }}，不再重算</div>
            </dd>
          </dl>
          <p v-if="view.priority.basis === '派队快照'" class="cell-note">
            历史记录保持派队当时的深度、范围与优先级结论，算法调整不会改动本页。
          </p>
        </article>
      </div>

      <section class="queue-block">
        <h3 class="queue-title">处置流转（只能单向推进）</h3>
        <ol class="status-track">
          <li v-for="step in track" :key="step.status" :class="{ done: step.reached, current: step.current }">
            <span class="track-status">{{ step.status }}</span>
            <span v-if="step.time" class="cell-note">{{ step.time }}</span>
          </li>
        </ol>
        <div class="row-actions detail-actions">
          <button
            v-if="view.row.status === '待处置'"
            class="btn primary"
            type="button"
            @click="openDispatch"
          >派出处置</button>
          <button
            v-if="view.row.status === '处置中'"
            class="btn primary"
            type="button"
            @click="doRecede"
          >确认退水（结论落入待归队清单）</button>
          <button
            v-if="view.row.status === '待处置' || view.row.status === '处置中'"
            class="btn"
            type="button"
            @click="doEscalate"
          >上报升级</button>
        </div>
        <p v-if="message" :class="messageOk ? 'ok-text' : 'error-text'">{{ message }}</p>
      </section>
    </template>

    <div v-if="dispatchOpen" class="modal-mask" @click.self="dispatchOpen = false">
      <form class="modal" @submit.prevent="submitDispatch">
        <h3>派出处置 · {{ code }}</h3>
        <label class="form-item">
          <span>处置队 *</span>
          <select v-model="dispatchTeam">
            <option v-for="name in teamNames" :key="name" :value="name">{{ name }}</option>
          </select>
        </label>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="dispatchOpen = false">取消</button>
          <button class="btn primary" type="submit">确认派出</button>
        </div>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import {
  confirmRecede,
  dispatchWaterlog,
  escalateWaterlog,
  waterlogDetail,
  type WaterlogView,
} from '@/domain/waterlog'

const route = useRoute()
const code = decodeURIComponent(String(route.params.code ?? ''))
const teamNames = ['抢险一班', '抢险二班', '抢险三班', '抢险四班']

const view = ref<WaterlogView | undefined>(waterlogDetail(code))
const message = ref('')
const messageOk = ref(false)

const dispatchOpen = ref(false)
const dispatchTeam = ref(teamNames[0])

function text(field: string): string {
  return view.value ? String(view.value.row[field] ?? '').trim() : ''
}

function priorityClass(level: string): string {
  if (level === '一级') return 'p1'
  if (level === '二级') return 'p2'
  return 'p3'
}

const track = computed(() => {
  const status = view.value ? String(view.value.row.status) : ''
  const steps = [
    { status: '待处置', time: text('上报时间') },
    { status: '处置中', time: text('派队时间') },
    { status: '已退水', time: text('退水时间') },
  ]
  const order = ['待处置', '处置中', '已退水']
  const currentIndex = order.indexOf(status)
  return steps.map((step, index) => ({
    ...step,
    reached: index <= currentIndex || status === '已升级',
    current: step.status === status,
  }))
})

function reload() {
  view.value = waterlogDetail(code)
}

function notify(ok: boolean, textValue: string) {
  messageOk.value = ok
  message.value = textValue
}

function openDispatch() {
  dispatchTeam.value = text('处置队') || teamNames[0]
  dispatchOpen.value = true
}

function submitDispatch() {
  if (!view.value) return
  const result = dispatchWaterlog(Number(view.value.row.id), dispatchTeam.value)
  notify(result.ok, result.message)
  if (result.ok) {
    dispatchOpen.value = false
    reload()
  }
}

function doRecede() {
  if (!view.value) return
  const result = confirmRecede(Number(view.value.row.id))
  notify(result.ok, result.message)
  if (result.ok) reload()
}

function doEscalate() {
  if (!view.value) return
  const result = escalateWaterlog(Number(view.value.row.id))
  notify(result.ok, result.message)
  if (result.ok) reload()
}

onMounted(reload)
</script>
