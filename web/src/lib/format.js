export const VEHICLE_STATUS = {
  online: { label: '上线', dot: 'bg-signal-online', text: 'text-signal-online', border: 'border-signal-online/50', bg: 'bg-signal-online/10' },
  waiting: { label: '待镟修', dot: 'bg-signal-waiting', text: 'text-signal-waiting', border: 'border-signal-waiting/50', bg: 'bg-signal-waiting/10' },
  maintaining: { label: '镟修中', dot: 'bg-signal-maintaining', text: 'text-signal-maintaining', border: 'border-signal-maintaining/50', bg: 'bg-signal-maintaining/10' },
  offline: { label: '下线锁定', dot: 'bg-signal-offline', text: 'text-signal-offline', border: 'border-signal-offline/50', bg: 'bg-signal-offline/10' },
}

export const MACHINE_STATUS = {
  idle: { label: '空闲', text: 'text-signal-online', border: 'border-signal-online/50', bg: 'bg-signal-online/10' },
  busy: { label: '作业中', text: 'text-signal-maintaining', border: 'border-signal-maintaining/50', bg: 'bg-signal-maintaining/10' },
  maintenance: { label: '保养中', text: 'text-signal-offline', border: 'border-signal-offline/50', bg: 'bg-signal-offline/10' },
}

export const SCHEDULE_STATUS = {
  pending: { label: '待执行', text: 'text-signal-waiting', border: 'border-signal-waiting/50', bg: 'bg-signal-waiting/10' },
  in_progress: { label: '镟修中', text: 'text-signal-maintaining', border: 'border-signal-maintaining/50', bg: 'bg-signal-maintaining/10' },
  completed: { label: '已完成', text: 'text-signal-online', border: 'border-signal-online/50', bg: 'bg-signal-online/10' },
  cancelled: { label: '已取消', text: 'text-steel-400', border: 'border-base-600', bg: 'bg-base-800' },
}

export const SCHEDULE_TYPE = {
  normal: { label: '常规', text: 'text-steel-300', border: 'border-base-600', bg: 'bg-base-800' },
  emergency: { label: '抢修', text: 'text-red-300', border: 'border-red-700/60', bg: 'bg-red-900/20' },
}

export const REWORK_TASK_STATUS = {
  pending: { label: '待排程', text: 'text-signal-offline', border: 'border-signal-offline/50', bg: 'bg-signal-offline/10' },
  scheduled: { label: '已排程', text: 'text-signal-waiting', border: 'border-signal-waiting/50', bg: 'bg-signal-waiting/10' },
  resolved: { label: '已解决', text: 'text-signal-online', border: 'border-signal-online/50', bg: 'bg-signal-online/10' },
}

export const DIMENSION_REVIEW_STATUS = {
  pending: { label: '待复核', text: 'text-signal-pending', border: 'border-signal-pending/50', bg: 'bg-signal-pending/10' },
  pass: { label: '复核通过', text: 'text-signal-online', border: 'border-signal-online/50', bg: 'bg-signal-online/10' },
  fail: { label: '复核不通过', text: 'text-signal-offline', border: 'border-signal-offline/50', bg: 'bg-signal-offline/10' },
}

export const INSPECTION_RESULT = {
  pending: { label: '待质检', text: 'text-signal-pending', border: 'border-signal-pending/50', bg: 'bg-signal-pending/10' },
  pass: { label: '合格', text: 'text-signal-online', border: 'border-signal-online/50', bg: 'bg-signal-online/10' },
  fail: { label: '不合格', text: 'text-signal-offline', border: 'border-signal-offline/50', bg: 'bg-signal-offline/10' },
}

export function fmtNum(n, digits = 1) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '—'
  return Number(n).toFixed(digits)
}

export function diffTone(diff, threshold = 3.0) {
  if (diff == null) return { text: 'text-steel-400', label: '—' }
  if (diff > threshold) return { text: 'text-signal-offline', label: '超阈' }
  if (diff > threshold * 0.6) return { text: 'text-signal-waiting', label: '偏高' }
  return { text: 'text-signal-online', label: '正常' }
}
