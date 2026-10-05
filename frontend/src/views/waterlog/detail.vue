<template>
  <section class="page" v-if="view" data-module="waterlog-detail">
    <header class="page-head">
      <div>
        <h2>内涝详情 · {{ view.code }}</h2>
        <p class="page-desc">详情页不再单独按影响范围推优先级，直接取统一派队算法对该内涝编号的唯一结论。</p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" to="/waterlog">返回派队队列</RouterLink>
      </div>
    </header>

    <p v-if="message" :class="messageOk ? 'ok-text' : 'error-text'">{{ message }}</p>

    <div class="detail-grid">
      <article class="detail-card">
        <h3 class="card-title">统一派队结论</h3>
        <div class="prio-head">
          <span class="prio-badge big" :class="`prio-${view.priority.level}`">{{ view.priority.level }}</span>
          <span class="rank-score">{{ view.priority.rankScore }} 分</span>
          <span class="tag" :class="view.priority.boundary === '界内' ? 'in' : 'out'">{{ view.priority.boundary }}</span>
        </div>
        <p class="algo-line">
          算法版本：{{ view.priority.algoVersion }}
          <span v-if="view.frozen" class="frozen-flag">（派队当时冻结快照，调整算法不重算）</span>
          <span v-else class="live-flag">（未派队，按当前上报数据实时推算）</span>
        </p>
        <ul class="grade-list">
          <li>积水深度：{{ view.priority.depthCm }} cm → {{ gradeText(view.priority.depthGrade) }}</li>
          <li>影响面积：{{ view.priority.affectedAreaM2 }} ㎡ → {{ gradeText(view.priority.areaGrade) }}</li>
          <li>影响人口：{{ view.priority.affectedPeople }} 人 → {{ gradeText(view.priority.peopleGrade) }}</li>
        </ul>
        <p v-if="view.priority.boundary === '超出边界'" class="boundary-warn">
          影响范围超出辖区边界，已单独提出，需移交相邻辖区，不进入正常派队队列。
        </p>
      </article>

      <article class="detail-card">
        <h3 class="card-title">基本信息</h3>
        <dl class="info-list">
          <div><dt>内涝编号</dt><dd>{{ view.code }}</dd></div>
          <div><dt>内涝点位</dt><dd>{{ view.site }}</dd></div>
          <div><dt>点位坐标</dt><dd>{{ view.lng }}, {{ view.lat }}</dd></div>
          <div><dt>影响半径</dt><dd>{{ view.radiusM }} 米</dd></div>
          <div><dt>处置队</dt><dd>{{ view.team || '—' }}</dd></div>
          <div><dt>上报次数</dt><dd>第 {{ view.reportCount }} 次（重复上报并入同一条）</dd></div>
          <div><dt>首报时间</dt><dd>{{ view.firstReportAt }}</dd></div>
          <div><dt>最近上报</dt><dd>{{ view.lastReportAt }}</dd></div>
        </dl>
      </article>

      <article class="detail-card">
        <h3 class="card-title">处置推进（单向）</h3>
        <ol class="status-flow">
          <li :class="stepClass('待处置')">待处置<span class="step-time">{{ view.firstReportAt }}</span></li>
          <li :class="stepClass('处置中')">处置中<span class="step-time">{{ view.dispatchedAt || '—' }}</span></li>
          <li :class="stepClass('已退水')">已退水<span class="step-time">{{ view.recededAt || '—' }}</span></li>
          <li :class="stepClass('已升级')">已升级（移交）<span class="step-time">—</span></li>
        </ol>
        <p class="flow-note">状态只能从待处置向处置中、再向已退水/已升级推进，不能回退。</p>
        <div class="detail-actions">
          <button
            v-if="view.status === '待处置' && view.priority.boundary === '界内'"
            class="btn primary"
            type="button"
            @click="dispatch"
          >派出处置</button>
          <button v-if="view.status === '处置中'" class="btn primary" type="button" @click="recede">确认退水</button>
          <button
            v-if="view.status === '待处置' || view.status === '处置中'"
            class="btn"
            type="button"
            @click="escalate"
          >上报升级</button>
        </div>
      </article>
    </div>

    <article v-if="note" class="detail-card note-card">
      <h3 class="card-title">备注</h3>
      <p>{{ note }}</p>
    </article>
  </section>

  <section v-else class="page">
    <p class="error-text">没有找到该内涝编号的记录。</p>
    <RouterLink class="btn" to="/waterlog">返回派队队列</RouterLink>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import {
  dispatchWaterlog,
  escalateWaterlog,
  getWaterlogView,
  recedeWaterlog,
} from '@/domain/waterlog'
import type { WaterlogView } from '@/domain/waterlog'

const route = useRoute()
const code = String(route.params.code ?? '')
const view = ref<WaterlogView | undefined>(getWaterlogView(code))
const message = ref('')
const messageOk = ref(true)
const note = ref(view.value?.note ?? '')

const STATUS_ORDER = ['待处置', '处置中', '已退水', '已升级'] as const

function gradeText(grade: 1 | 2 | 3): string {
  return grade === 3 ? '重度（3档）' : grade === 2 ? '中度（2档）' : '轻度（1档）'
}

function stepClass(step: (typeof STATUS_ORDER)[number]): string {
  if (!view.value) {
    return ''
  }
  const current = STATUS_ORDER.indexOf(view.value.status)
  const target = STATUS_ORDER.indexOf(step)
  // 已升级是分支终点：走到已升级时，「已退水」不算到达。
  if (view.value.status === '已升级') {
    return step === '已升级' || step === '待处置' || step === '处置中' ? 'done' : ''
  }
  return target <= current ? 'done' : ''
}

function flash(text: string, ok: boolean) {
  message.value = text
  messageOk.value = ok
}

function refresh() {
  view.value = getWaterlogView(code)
  note.value = view.value?.note ?? ''
}

function dispatch() {
  const result = dispatchWaterlog(code, '抢险一队')
  flash(result.message, result.ok)
  refresh()
}

function recede() {
  const result = recedeWaterlog(code)
  flash(result.message, result.ok)
  refresh()
}

function escalate() {
  const result = escalateWaterlog(code)
  flash(result.message, result.ok)
  refresh()
}

onMounted(refresh)
</script>

<style scoped>
.detail-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.detail-card { background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; }
.card-title { font-size: 14px; margin: 0 0 10px; }
.prio-head { display: flex; align-items: center; gap: 10px; }
.prio-badge { border-radius: 6px; padding: 2px 8px; font-weight: 600; font-size: 13px; color: #fff; }
.prio-badge.big { font-size: 18px; padding: 4px 14px; }
.prio-P1 { background: #d92d20; }
.prio-P2 { background: #f79009; }
.prio-P3 { background: #12b76a; }
.rank-score { font-size: 18px; font-weight: 600; }
.tag { border-radius: 999px; padding: 2px 10px; font-size: 12px; }
.tag.in { background: #e7f6ec; color: #067647; }
.tag.out { background: #fef0c7; color: #b54708; }
.algo-line { font-size: 12px; color: var(--muted); margin: 10px 0 6px; }
.frozen-flag { color: #b54708; }
.live-flag { color: #067647; }
.grade-list { margin: 6px 0 0; padding-left: 18px; font-size: 13px; line-height: 1.9; }
.boundary-warn { margin-top: 8px; font-size: 12px; color: #b54708; background: #fffaeb; border-radius: 6px; padding: 6px 8px; }
.info-list { margin: 0; }
.info-list div { display: flex; justify-content: space-between; font-size: 13px; padding: 5px 0; border-bottom: 1px dashed #eef2f7; }
.info-list dt { color: var(--muted); }
.info-list dd { margin: 0; }
.status-flow { margin: 0; padding-left: 20px; font-size: 13px; line-height: 2; }
.status-flow li.done { color: #067647; font-weight: 600; }
.step-time { color: var(--muted); font-weight: 400; margin-left: 8px; font-size: 12px; }
.flow-note { font-size: 12px; color: var(--muted); margin: 8px 0; }
.detail-actions { display: flex; gap: 8px; margin-top: 10px; }
.note-card { margin-top: 12px; }
.ok-text { color: #067647; font-size: 13px; }
</style>
