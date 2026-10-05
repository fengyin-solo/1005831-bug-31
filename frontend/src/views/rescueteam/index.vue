<template>
  <section class="page" data-module="rescueteam">
    <header class="page-head">
      <div>
        <h2>抢险队归队看板</h2>
        <p class="page-desc">
          本看板不再自行推算先后：内涝退水结论落入对应抢险队的待归队清单，优先级取退水当时的统一算法快照；
          原记录保持当时结论，不随算法调整重算。
        </p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" to="/waterlog">前往派队队列</RouterLink>
      </div>
    </header>

    <div class="stat-row">
      <article class="stat-card">
        <span class="stat-label">待归队</span>
        <strong class="stat-value warn">{{ waiting.length }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">已归队（历史归档）</span>
        <strong class="stat-value">{{ returned.length }}</strong>
      </article>
    </div>

    <section class="queue-block">
      <h3 class="block-title warn-title">待归队清单（内涝退水结论落入）</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>退水顺位</th>
            <th>内涝编号</th>
            <th>目标点位</th>
            <th>抢险队</th>
            <th>退水时优先级</th>
            <th>算法版本</th>
            <th>退水时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(task, index) in waiting" :key="task.id">
            <td>{{ index + 1 }}</td>
            <td><RouterLink class="link" :to="`/waterlog/${encodeURIComponent(task.waterlogCode)}`">{{ task.waterlogCode }}</RouterLink></td>
            <td>{{ task.site }}</td>
            <td>{{ task.team }}</td>
            <td>
              <span class="prio-badge" :class="`prio-${task.prioritySnapshot.level}`">{{ task.prioritySnapshot.level }}</span>
              <span class="score">{{ task.prioritySnapshot.rankScore }}分</span>
            </td>
            <td><span class="version">{{ task.prioritySnapshot.algoVersion }}</span></td>
            <td>{{ task.recededAt }}</td>
            <td class="row-actions">
              <button class="link" type="button" @click="confirm(task.id)">确认归队</button>
            </td>
          </tr>
          <tr v-if="!waiting.length">
            <td colspan="8" class="empty-state">暂无待归队抢险任务</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="queue-block">
      <h3 class="block-title">已归队记录（保持退水当时结论，不重算）</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>内涝编号</th>
            <th>目标点位</th>
            <th>抢险队</th>
            <th>退水时优先级</th>
            <th>算法版本</th>
            <th>退水时间</th>
            <th>归队时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="task in returned" :key="task.id">
            <td><RouterLink class="link" :to="`/waterlog/${encodeURIComponent(task.waterlogCode)}`">{{ task.waterlogCode }}</RouterLink></td>
            <td>{{ task.site }}</td>
            <td>{{ task.team }}</td>
            <td>
              <span class="prio-badge" :class="`prio-${task.prioritySnapshot.level}`">{{ task.prioritySnapshot.level }}</span>
              <span class="score">{{ task.prioritySnapshot.rankScore }}分</span>
            </td>
            <td><span class="version">{{ task.prioritySnapshot.algoVersion }}</span></td>
            <td>{{ task.recededAt }}</td>
            <td>{{ task.returnedAt }}</td>
          </tr>
          <tr v-if="!returned.length">
            <td colspan="7" class="empty-state">暂无已归队历史记录</td>
          </tr>
        </tbody>
      </table>
    </section>

    <p v-if="message" :class="messageOk ? 'ok-text' : 'error-text'">{{ message }}</p>

    <footer class="page-foot">
      <span>看板只读取内涝退水落入的结论，不重新派队；顺序、分值与列表、详情完全一致</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { confirmReturn, recallBoard } from '@/domain/waterlog'
import type { RecallTask } from '@/domain/waterlog'

const waiting = ref<RecallTask[]>([])
const returned = ref<RecallTask[]>([])
const message = ref('')
const messageOk = ref(true)

function reload() {
  const board = recallBoard()
  waiting.value = board.waiting
  returned.value = board.returned
}

function confirm(id: number) {
  const result = confirmReturn(id)
  message.value = result.message
  messageOk.value = result.ok
  reload()
}

onMounted(reload)
</script>

<style scoped>
.queue-block { margin: 16px 0 8px; }
.block-title { font-size: 14px; margin: 0 0 8px; }
.warn-title { color: #b54708; }
.score { margin-left: 6px; color: var(--muted); font-size: 12px; }
.version { font-size: 11px; color: var(--muted); background: #eef2f7; border-radius: 4px; padding: 1px 6px; }
.warn { color: #b54708; }
.ok-text { color: #067647; font-size: 13px; }
.prio-badge { display: inline-block; min-width: 30px; text-align: center; border-radius: 6px; padding: 2px 6px; font-weight: 600; font-size: 12px; color: #fff; }
.prio-P1 { background: #d92d20; }
.prio-P2 { background: #f79009; }
.prio-P3 { background: #12b76a; }
</style>
