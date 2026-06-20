import { useMemo, useState } from 'react'
import { api } from '../api/client.js'
import { useAsync } from '../lib/useAsync.js'
import { useRole } from '../lib/role.jsx'
import { SectionTitle, Pill, Badge, Loading, EmptyState, ErrorBanner, Modal, Field } from '../lib/ui.jsx'
import { SCHEDULE_STATUS, SCHEDULE_TYPE, REWORK_TASK_STATUS, fmtNum, diffTone } from '../lib/format.js'

const STATUS_FILTERS = ['all', 'pending', 'in_progress', 'completed', 'cancelled']

export default function Schedules() {
  const { can } = useRole()
  const editable = can('manageSchedules')
  const { data: rows, loading, error, reload, setData } = useAsync(api.schedules, [])
  const { data: reworkTasks } = useAsync(api.reworkTasks, [])
  const { data: vehicles } = useAsync(api.vehicles, [])
  const { data: machines } = useAsync(api.machines, [])

  const [filter, setFilter] = useState('all')
  const [tab, setTab] = useState('queue')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const [historyModal, setHistoryModal] = useState(null)
  const [historyData, setHistoryData] = useState(null)

  const list = useMemo(() => {
    if (!rows) return []
    let arr = rows
    if (filter !== 'all') arr = arr.filter((s) => s.status === filter)
    return [...arr].sort((a, b) => (a.queue_order || 0) - (b.queue_order || 0))
  }, [rows, filter])

  const openCreate = () => {
    setForm({
      vehicle_id: vehicles?.[0]?.id || '',
      machine_id: machines?.find((m) => m.status === 'idle')?.id || machines?.[0]?.id || '',
      scheduled_start: '',
      priority_level: 1,
      remark: '',
      schedule_type: 'normal',
    })
    setErr(null)
    setModal({ mode: 'create' })
  }
  const openEdit = (s) => {
    setForm({
      vehicle_id: s.vehicle_id,
      machine_id: s.machine_id,
      scheduled_start: s.scheduled_start || '',
      priority_level: s.priority_level || 1,
      remark: s.remark || '',
      status: s.status,
      schedule_type: s.schedule_type || 'normal',
    })
    setErr(null)
    setModal({ mode: 'edit', id: s.id })
  }

  const submit = async () => {
    setSaving(true)
    setErr(null)
    const body = {
      vehicle_id: Number(form.vehicle_id),
      machine_id: Number(form.machine_id),
      scheduled_start: form.scheduled_start || null,
      priority_level: Number(form.priority_level) || 1,
      remark: form.remark || null,
      schedule_type: form.schedule_type || 'normal',
      status: modal.mode === 'edit' ? form.status : undefined,
    }
    try {
      if (modal.mode === 'create') {
        await api.createSchedule(body)
      } else {
        await api.updateSchedule(modal.id, body)
      }
      setModal(null)
      reload()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  const jumpQueue = async (s) => {
    if (!confirm(`确认将 ${s.vehicle_no} 排程插队到最前？`)) return
    try {
      await api.jumpQueue(s.id, { target_position: 1 })
      reload()
    } catch (e) {
      alert(e.message)
    }
  }

  const doMaintenanceReview = async (s) => {
    const reviewer = prompt('请输入主管姓名 (保养复核):')
    if (!reviewer) return
    const remark = prompt('审核备注（可选）:') || ''
    try {
      await api.maintenanceReview({ schedule_id: s.id, reviewer, remark: remark || null })
      reload()
      alert('主管复核通过，已允许在保养机位排程')
    } catch (e) {
      alert(e.message)
    }
  }

  const showHistory = async (s) => {
    setHistoryModal({ id: s.id, vehicle_no: s.vehicle_no })
    try {
      const data = await api.scheduleHistory(s.id)
      setHistoryData(data)
    } catch (e) {
      setHistoryData({ error: e.message })
    }
  }

  const resolveRework = async (t) => {
    const solution = prompt('请输入解决方案说明:')
    if (!solution) return
    try {
      await api.resolveReworkTask(t.id, { resolution: solution, resolved_by: '当前用户' })
      reload()
    } catch (e) {
      alert(e.message)
    }
  }

  const remove = async (s) => {
    if (!confirm(`确认取消排程 #${s.id}？`)) return
    try {
      await api.deleteSchedule(s.id)
      setData((d) => (d || []).filter((x) => x.id !== s.id))
    } catch (e) {
      alert(e.message)
    }
  }

  if (loading || !rows) return <Loading />

  const pendingCnt = rows.filter((s) => s.status === 'pending').length
  const activeCnt = rows.filter((s) => s.status === 'in_progress').length

  return (
    <div>
      <SectionTitle
        title="镟修排程"
        desc="智能排队：轮径差 → 上线计划 → 机位窗口；支持抢修插队、保养复核、变更回放"
        right={
          editable && (
            <div className="flex gap-2">
              <button className="btn btn-primary" onClick={openCreate}>+ 新增排程</button>
            </div>
          )
        }
      />
      {error && <ErrorBanner message={error} />}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          <button onClick={() => setTab('queue')}
            className={`border px-3 py-1 text-xs transition-colors ${
              tab === 'queue' ? 'border-amber/70 bg-amber/15 text-amber-glow'
                : 'border-base-700 bg-base-850 text-steel-300 hover:border-base-600'
            }`}>排队视图 ({pendingCnt})</button>
          <button onClick={() => setTab('rework')}
            className={`border px-3 py-1 text-xs transition-colors ${
              tab === 'rework' ? 'border-amber/70 bg-amber/15 text-amber-glow'
                : 'border-base-700 bg-base-850 text-steel-300 hover:border-base-600'
            }`}>返修任务 ({(reworkTasks || []).filter(t => t.task_status !== 'resolved').length})</button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`border px-3 py-1 text-xs transition-colors ${
                filter === f
                  ? 'border-amber/70 bg-amber/15 text-amber-glow'
                  : 'border-base-700 bg-base-850 text-steel-300 hover:border-base-600'
              }`}
            >
              {f === 'all' ? '全部' : SCHEDULE_STATUS[f].label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'queue' && (
        <div className="panel">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-base-700 text-left text-[11px] uppercase tracking-wider text-steel-400">
                  <th className="px-4 py-2.5">#</th>
                  <th className="px-4 py-2.5">车辆</th>
                  <th className="px-4 py-2.5">类型</th>
                  <th className="px-4 py-2.5">镟修机</th>
                  <th className="px-4 py-2.5">计划开始</th>
                  <th className="px-4 py-2.5">状态</th>
                  <th className="px-4 py-2.5">轮径差</th>
                  <th className="px-4 py-2.5">上线计划</th>
                  <th className="px-4 py-2.5">备注</th>
                  <th className="px-4 py-2.5 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => {
                  const tone = diffTone(s.wheel_diameter_diff)
                  const machine = machines?.find(m => m.id === s.machine_id)
                  const inMaintenance = machine && machine.maintenance_flag
                  return (
                    <tr key={s.id} className="table-row">
                      <td className="px-4 py-2.5">
                        {s.queue_order ? (
                          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-sm border border-amber/60 bg-amber/10 px-1 font-mono text-xs text-amber-glow">
                            {s.queue_order}
                          </span>
                        ) : <span className="text-steel-500">—</span>}
                        {s.is_recheck && <span className="ml-1 text-[10px] text-signal-pending">复核</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-steel-200">{s.vehicle_no}</span>
                        {s.rework_from_inspection_id && <span className="ml-1 text-[10px] text-red-300">返修</span>}
                      </td>
                      <td className="px-4 py-2.5"><Pill map={SCHEDULE_TYPE} status={s.schedule_type || 'normal'} /></td>
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-steel-300">{s.machine_name}</span>
                        {inMaintenance && s.status === 'pending' && !s.maintenance_approved_by && (
                          <div className="text-[10px] text-signal-offline">🔧 保养中</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-steel-300">{s.scheduled_start || '—'}</td>
                      <td className="px-4 py-2.5"><Pill map={SCHEDULE_STATUS} status={s.status} /></td>
                      <td className="px-4 py-2.5">
                        <span className={`stat-num ${tone.text}`}>{fmtNum(s.wheel_diameter_diff, 2)}</span>
                        <span className={`ml-1 text-[10px] ${tone.text}`}>{tone.label}</span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-steel-300">{s.online_plan_date || '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-steel-400 max-w-[140px] truncate">{s.remark || '—'}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {editable && (
                          <div className="flex justify-end gap-1 flex-wrap">
                            {s.status === 'pending' && (
                              <button className="btn btn-ghost !px-2 !py-1 text-xs text-red-300" onClick={() => jumpQueue(s)} title="插队到最前">
                                插队
                              </button>
                            )}
                            {s.status === 'pending' && inMaintenance && !s.maintenance_approved_by && (
                              <button className="btn btn-ghost !px-2 !py-1 text-xs text-signal-waiting" onClick={() => doMaintenanceReview(s)} title="保养机位紧急复核">
                                主管复核
                              </button>
                            )}
                            <button className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => showHistory(s)} title="查看变更历史/回放">
                              回放
                            </button>
                            <button className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => openEdit(s)}>编辑</button>
                            <button className="btn btn-ghost !px-2 !py-1 text-xs text-signal-offline" onClick={() => remove(s)}>取消</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {list.length === 0 && <EmptyState text="暂无排程数据" />}
        </div>
      )}

      {tab === 'rework' && (
        <div className="panel">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-base-700 text-left text-[11px] uppercase tracking-wider text-steel-400">
                  <th className="px-4 py-2.5">车辆</th>
                  <th className="px-4 py-2.5">状态</th>
                  <th className="px-4 py-2.5">返修原因</th>
                  <th className="px-4 py-2.5">来源</th>
                  <th className="px-4 py-2.5">创建人</th>
                  <th className="px-4 py-2.5">创建时间</th>
                  <th className="px-4 py-2.5">解决方案</th>
                  <th className="px-4 py-2.5 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {(reworkTasks || []).map((t) => (
                  <tr key={t.id} className="table-row">
                    <td className="px-4 py-2.5 font-mono text-steel-200">{t.vehicle_no}</td>
                    <td className="px-4 py-2.5"><Pill map={REWORK_TASK_STATUS} status={t.task_status || 'pending'} /></td>
                    <td className="px-4 py-2.5 text-xs text-steel-300">{t.rework_reason || '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-steel-400">
                      {t.inspection_id ? `质检#${t.inspection_id}` : t.source_schedule_id ? `排程#${t.source_schedule_id}` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-steel-400">{t.assigned_by || '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-steel-400">{t.created_at || '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-steel-400">{t.resolution || '—'}</td>
                    <td className="px-4 py-2.5 text-right">
                      {(t.task_status === 'pending' || t.task_status === 'scheduled') && editable && (
                        <button className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => resolveRework(t)}>标记完成</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(reworkTasks || []).length === 0 && <EmptyState text="暂无返修任务" />}
        </div>
      )}

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.mode === 'create' ? '新增排程' : '编辑排程'}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setModal(null)}>取消</button>
            <button className="btn btn-primary" onClick={submit} disabled={saving || !form.vehicle_id || !form.machine_id}>
              {saving ? '保存中…' : '保存'}
            </button>
          </>
        }
      >
        {err && <ErrorBanner message={err} onDismiss={() => setErr(null)} />}
        <Field label="车辆">
          <select className="input" value={form.vehicle_id || ''}
            onChange={(e) => setForm((f) => ({ ...f, vehicle_id: e.target.value }))}>
            <option value="">请选择车辆</option>
            {(vehicles || []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.vehicle_no} {v.emergency_flag ? ' 🚨紧急' : ''} (轮径差 {fmtNum(v.wheel_diameter_diff, 2)}mm)
              </option>
            ))}
          </select>
        </Field>
        <Field label="镟修机位">
          <select className="input" value={form.machine_id || ''}
            onChange={(e) => setForm((f) => ({ ...f, machine_id: e.target.value }))}>
            <option value="">请选择镟修机</option>
            {(machines || []).map((m) => (
              <option key={m.id} value={m.id} disabled={m.maintenance_flag}>
                {m.machine_name} [{m.status}] {m.maintenance_flag ? '🔧保养中' : ''}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="计划开始">
            <input type="datetime-local" className="input" value={form.scheduled_start || ''}
              onChange={(e) => setForm((f) => ({ ...f, scheduled_start: e.target.value }))} />
          </Field>
          <Field label="优先级 (1-5)">
            <input type="number" min="1" max="5" className="input" value={form.priority_level || 1}
              onChange={(e) => setForm((f) => ({ ...f, priority_level: e.target.value }))} />
          </Field>
        </div>
        {modal?.mode === 'edit' && (
          <Field label="状态">
            <select className="input" value={form.status || 'pending'}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              {Object.entries(SCHEDULE_STATUS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="排程类型">
          <select className="input" value={form.schedule_type || 'normal'}
            onChange={(e) => setForm((f) => ({ ...f, schedule_type: e.target.value }))}>
            <option value="normal">常规</option>
            <option value="emergency">抢修（插队优先）</option>
          </select>
        </Field>
        <Field label="备注">
          <textarea className="input" rows="2" value={form.remark || ''}
            onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))} />
        </Field>
      </Modal>

      <Modal
        open={!!historyModal}
        onClose={() => { setHistoryModal(null); setHistoryData(null) }}
        title={`排程变更回放 · ${historyModal?.vehicle_no || ''}`}
        wide
      >
        {!historyData && <Loading />}
        {historyData?.error && <ErrorBanner message={historyData.error} />}
        {historyData?.length === 0 && <EmptyState text="暂无变更记录" />}
        {(historyData || []).length > 0 && (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
            {historyData.map((h, idx) => (
              <div key={h.id} className="border border-base-700 rounded-sm bg-base-900/40 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-5 min-w-[24px] items-center justify-center rounded-sm border border-base-600 bg-base-800 px-1.5 font-mono text-xs text-steel-300">
                      #{idx + 1}
                    </span>
                    <span className="font-mono text-xs text-amber-glow">{h.action_type || '变更'}</span>
                    <span className="font-mono text-[11px] text-steel-400">{h.operator || '系统'}</span>
                  </div>
                  <span className="font-mono text-[11px] text-steel-400">{h.changed_at}</span>
                </div>
                {h.remark && <div className="text-xs text-steel-300 mb-2">{h.remark}</div>}
                {h.old_values && h.new_values && (
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <div className="text-steel-400 mb-1">变更前</div>
                      <pre className="bg-base-950 border border-base-800 p-2 rounded-sm font-mono whitespace-pre-wrap text-steel-300">
                        {JSON.stringify(h.old_values, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <div className="text-steel-400 mb-1">变更后</div>
                      <pre className="bg-base-950 border border-base-800 p-2 rounded-sm font-mono whitespace-pre-wrap text-steel-200">
                        {JSON.stringify(h.new_values, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
                {h.snapshot_json && !h.old_values && (
                  <div>
                    <div className="text-steel-400 mb-1 text-[11px]">快照</div>
                    <pre className="bg-base-950 border border-base-800 p-2 rounded-sm font-mono whitespace-pre-wrap text-xs text-steel-300 max-h-40 overflow-auto">
                      {JSON.stringify(typeof h.snapshot_json === 'string' ? JSON.parse(h.snapshot_json) : h.snapshot_json, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}
