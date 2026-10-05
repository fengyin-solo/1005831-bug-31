<template>
  <section class="page" data-module="rescueteam">
    <header class="page-head">
      <div>
        <h2>抢险队调度 · 归队看板</h2>
        <p class="page-desc">
          看板不再自行推派队优先级；凡内涝处置任务，一律按内涝编号回查统一派队算法（派队快照），与列表、详情同序。内涝退水结论自动进入「待归队」。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记通用抢险任务</button>
        <button class="btn" type="button" @click="exportRows">导出抢险队调度清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article class="stat-card">
        <span class="stat-label">待派队任务</span>
        <strong class="stat-value">{{ board.waiting.length }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">抢险中任务</span>
        <strong class="stat-value">{{ board.rescuing.length }}</strong>
      </article>
      <article class="stat-card stat-warn">
        <span class="stat-label">待归队（内涝退水结论）</span>
        <strong class="stat-value">{{ board.returning.length }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">已归队任务</span>
        <strong class="stat-value">{{ board.returned.length }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">已终止任务</span>
        <strong class="stat-value">{{ board.stopped.length }}</strong>
      </article>
    </div>

    <div class="kanban">
      <section v-for="column in columns" :key="column.key" class="kanban-col">
        <header class="kanban-head">
          <strong>{{ column.title }}</strong>
          <span class="kanban-count">{{ board[column.key].length }}</span>
        </header>

        <article v-for="item in board[column.key]" :key="String(item.row.id)" class="task-card">
          <div class="task-top">
            <span class="task-no">{{ val(item, '任务编号') }}</span>
            <span class="task-type">{{ val(item, '任务类型') }}</span>
          </div>
          <div class="task-site">{{ val(item, '目标点位') }}</div>
          <div class="task-meta">抢险队：{{ val(item, '抢险队') || '待指定' }}</div>
          <div class="task-meta">负责人：{{ val(item, '负责人') || '—' }}</div>
          <div v-if="val(item, '出队时间')" class="task-meta">出队：{{ val(item, '出队时间') }}</div>

          <!-- 内涝处置任务：优先级只从统一算法按编号回查，看板不自算 -->
          <div v-if="item.linkedCode" class="task-link">
            <RouterLink class="link" :to="`/waterlog/${encodeURIComponent(item.linkedCode)}`">
              内涝编号：{{ item.linkedCode }}
            </RouterLink>
            <span
              v-if="item.linkedPriority"
              class="priority-tag"
              :class="priorityClass(item.linkedPriority.priorityLevel)"
            >
              {{ item.linkedPriority.priorityLevel }}（{{ item.linkedPriority.score }}）
            </span>
            <div v-if="item.linkedPriority" class="cell-note">
              口径：{{ item.linkedPriority.basis }}
              <template v-if="item.linkedPriority.frozenAt"> · 冻结 {{ item.linkedPriority.frozenAt }}</template>
            </div>
          </div>
          <div v-else class="cell-note">通用抢险任务，无内涝派队优先级</div>

          <!-- 退水结论只出现在待归队 / 已归队：原有历史结论保持原样 -->
          <div v-if="val(item, '退水结论')" class="recede-note">{{ val(item, '退水结论') }}</div>
          <div v-if="val(item, '归队时间')" class="task-meta">归队：{{ val(item, '归队时间') }}</div>

          <footer class="task-actions">
            <template v-if="item.row.status === '待派队'">
              <button class="link" type="button" @click="doDispatch(Number(item.row.id))">派出抢险</button>
              <button class="link danger" type="button" @click="doTerminate(Number(item.row.id))">终止任务</button>
            </template>
            <template v-else-if="item.row.status === '抢险中'">
              <button v-if="item.linkedCode" class="link" type="button" disabled title="需内涝确认退水后进入待归队">
                等待退水结论
              </button>
              <button v-else class="link" type="button" @click="doFinish(Number(item.row.id))">确认归队</button>
              <button class="link danger" type="button" @click="doTerminate(Number(item.row.id))">终止任务</button>
            </template>
            <template v-else-if="item.row.status === '待归队'">
              <button class="link" type="button" @click="doReturn(Number(item.row.id))">确认归队</button>
            </template>
            <template v-else>
              <span class="cell-note">历史记录，结论保持原样</span>
            </template>
          </footer>
        </article>

        <p v-if="!board[column.key].length" class="kanban-empty">暂无任务</p>
      </section>
    </div>

    <footer class="page-foot">
      <span>待归队清单即内涝退水结论的落点；原有记录保持当时的结论，不重推优先级</span>
      <span v-if="message" :class="messageOk ? 'ok-text' : 'error-text'">{{ message }}</span>
    </footer>

    <div v-if="createOpen" class="modal-mask" @click.self="createOpen = false">
      <form class="modal" @submit.prevent="submitCreate">
        <h3>登记通用抢险任务</h3>
        <p class="cell-note">内涝处置任务由内涝点「派出处置」自动生成，这里只登记非内涝类抢险。</p>
        <label class="form-item"><span>任务类型 *</span><input v-model="createForm.type" placeholder="如 泵站抢险 / 管网抢险" /></label>
        <label class="form-item"><span>目标点位 *</span><input v-model="createForm.site" placeholder="目标位置" /></label>
        <label class="form-item">
          <span>抢险队</span>
          <select v-model="createForm.team">
            <option v-for="name in teamNames" :key="name" :value="name">{{ name }}</option>
          </select>
        </label>
        <label class="form-item"><span>负责人</span><input v-model="createForm.leader" placeholder="默认值班管理员" /></label>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="createOpen = false">取消</button>
          <button class="btn primary" type="submit">登记任务</button>
        </div>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'

import { downloadEntries, moduleMeta } from '@/api/local-service'
import {
  confirmReturn,
  createGenericRescue,
  dispatchGenericRescue,
  finishGenericRescue,
  rescueBoard,
  terminateRescue,
  type RescueView,
} from '@/domain/waterlog'

const meta = moduleMeta('rescueteam')
const teamNames = ['抢险一班', '抢险二班', '抢险三班', '抢险四班']

const columns = [
  { key: 'waiting', title: '待派队' },
  { key: 'rescuing', title: '抢险中' },
  { key: 'returning', title: '待归队（退水结论）' },
  { key: 'returned', title: '已归队' },
  { key: 'stopped', title: '已终止' },
] as const

const board = ref(rescueBoard())
const message = ref('')
const messageOk = ref(false)

function val(item: RescueView, field: string): string {
  return String(item.row[field] ?? '').trim()
}

function priorityClass(level: string): string {
  if (level === '一级') return 'p1'
  if (level === '二级') return 'p2'
  return 'p3'
}

function notify(ok: boolean, text: string) {
  messageOk.value = ok
  message.value = text
}

function reload() {
  board.value = rescueBoard()
}

function handle(result: { ok: boolean; message: string }) {
  notify(result.ok, result.message)
  if (result.ok) reload()
}

function doDispatch(id: number) {
  handle(dispatchGenericRescue(id))
}

function doReturn(id: number) {
  handle(confirmReturn(id))
}

function doFinish(id: number) {
  handle(finishGenericRescue(id))
}

function doTerminate(id: number) {
  handle(terminateRescue(id))
}

function exportRows() {
  downloadEntries(meta.key)
}

const createOpen = ref(false)
const createForm = reactive({ type: '', site: '', team: teamNames[0], leader: '值班管理员' })

function openCreate() {
  Object.assign(createForm, { type: '', site: '', team: teamNames[0], leader: '值班管理员' })
  createOpen.value = true
}

function submitCreate() {
  const result = createGenericRescue({ ...createForm })
  if (result.ok) {
    createOpen.value = false
  }
  handle(result)
}

onMounted(reload)
</script>
