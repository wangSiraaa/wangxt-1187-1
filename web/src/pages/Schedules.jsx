import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAsync } from '../lib/useAsync.js'
import { useRole } from '../lib/role.jsx'
import { SectionTitle, Pill, Badge, Loading, EmptyState, ErrorBanner, Modal, Field } from '../lib/ui.jsx'
import { SCHEDULE_STATUS, VEHICLE_STATUS, fmtNum, diffTone } from '../lib/format.js'

export default function Schedules() {
  const { can } = useRole()
  const editable = can('manageSchedules')
  const { data: schedules, loading, error, reload, setData: setSchedules } = useAsync(api.schedules, [])
  const { data: vehicles } = useAsync(api.vehicles, [])
  const { data: machines } = useAsync(api.machines, [])

  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const [machinePick, setMachinePick] = useState({})

  const idleMachines = useMemo(
    () => (machines || []).filter((m) => m.status === 'idle' && !m.maintenance_flag),
    [machines]
  )
  const availableVehicles = useMemo(
    () => (vehicles || []).filter((v) => ['online', 'waiting'].includes(v.status)),
    [vehicles]
  )

  const today = new Date().toISOString().slice(0, 10)

  const openCreate = () => {
    setForm({ vehicle_id: '', machine_id: '', schedule_date: today, operator: '', remark: '' })
    setErr(null)
    setModal(true)
  }

  const submit = async () => {
    setSaving(true)
    setErr(null)
    try {
      await api.createSchedule({
        vehicle_id: Number(form.vehicle_id),
        machine_id: form.machine_id ? Number(form.machine_id) : null,
        schedule_date: form.schedule_date || null,
        operator: (form.operator || '').trim() || null,
        remark: (form.remark || '').trim() || null,
      })
      setModal(false)
      reload()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  const setStatus = async (sched, next, extra = {}) => {
    try {
      await api.updateSchedule(sched.id, { status: next, ...extra })
      reload()
    } catch (e) {
      alert(e.message)
    }
  }

  const assignAndStart = async (sched) => {
    const picked = machinePick[sched.id]
    if (!picked) {
      alert('请先选择一台机位')
      return
    }
    setStatus(sched, 'in_progress', { machine_id: Number(picked) })
  }

  const remove = async (sched) => {
    if (!confirm(`确认删除排程 #${sched.id}？`)) return
    try {
      await api.deleteSchedule(sched.id)
      setSchedules((d) => (d || []).filter((x) => x.id !== sched.id))
    } catch (e) {
      alert(e.message)
    }
  }

  if (loading || !schedules) return <Loading />

  const counts = {
    pending: schedules.filter((s) => s.status === 'pending').length,
    in_progress: schedules.filter((s) => s.status === 'in_progress').length,
    completed: schedules.filter((s) => s.status === 'completed').length,
  }

  return (
    <div>
      <SectionTitle
        title="排程作业"
        desc="检修班安排镟修机位 · 排程生命周期管理"
        right={
          editable && (
            <button className="btn btn-primary" onClick={openCreate} disabled={availableVehicles.length === 0}>
              + 新建排程
            </button>
          )
        }
      />
      {error && <ErrorBanner message={error} />}

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="panel p-3"><div className="text-[11px] text-steel-400">待执行</div><div className="stat-num text-2xl text-signal-waiting">{counts.pending}</div></div>
        <div className="panel p-3"><div className="text-[11px] text-steel-400">镟修中</div><div className="stat-num text-2xl text-signal-maintaining">{counts.in_progress}</div></div>
        <div className="panel p-3"><div className="text-[11px] text-steel-400">已完成</div><div className="stat-num text-2xl text-signal-online">{counts.completed}</div></div>
      </div>

      <div className="panel">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-base-700 text-left text-[11px] uppercase tracking-wider text-steel-400">
                <th className="px-4 py-2.5">#</th>
                <th className="px-4 py-2.5">车辆</th>
                <th className="px-4 py-2.5">修前轮径 (L/R)</th>
                <th className="px-4 py-2.5">机位</th>
                <th className="px-4 py-2.5">排程日期</th>
                <th className="px-4 py-2.5">状态</th>
                <th className="px-4 py-2.5">操作人</th>
                <th className="px-4 py-2.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => {
                const tone = diffTone(s.cur_left != null && s.cur_right != null ? Math.abs(s.cur_left - s.cur_right) : null)
                return (
                  <tr key={s.id} className="table-row align-top">
                    <td className="px-4 py-2.5 font-mono text-steel-400">{s.id}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-steel-200">{s.vehicle_no || '—'}</span>
                        {s.priority_flag ? <Badge tone="red">优先</Badge> : null}
                      </div>
                      <div className="mt-0.5"><Pill map={VEHICLE_STATUS} status={statusFromSchedule(s)} /></div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-steel-300">
                      {fmtNum(s.cur_left)} / {fmtNum(s.cur_right)}
                      <div className={`text-[10px] ${tone.text}`}>差 {fmtNum(s.cur_left != null && s.cur_right != null ? Math.abs(s.cur_left - s.cur_right) : null, 2)}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      {s.machine_no ? (
                        <span className="font-mono text-steel-200">{s.machine_no}</span>
                      ) : (
                        <span className="text-steel-400 text-xs">未分配</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-steel-300">{s.schedule_date || '—'}</td>
                    <td className="px-4 py-2.5"><Pill map={SCHEDULE_STATUS} status={s.status} /></td>
                    <td className="px-4 py-2.5 text-xs text-steel-300">{s.operator || '—'}</td>
                    <td className="px-4 py-2.5 text-right">
                      {editable && s.status === 'pending' && (
                        <div className="flex items-center justify-end gap-1.5">
                          {!s.machine_id && (
                            <select
                              className="input !py-1 !px-2 !w-auto text-xs"
                              value={machinePick[s.id] ?? ''}
                              onChange={(e) => setMachinePick((p) => ({ ...p, [s.id]: e.target.value }))}
                            >
                              <option value="">选择机位…</option>
                              {idleMachines.map((m) => (
                                <option key={m.id} value={m.id}>{m.machine_no} · {m.machine_name || '镟修机位'}</option>
                              ))}
                            </select>
                          )}
                          <button className="btn btn-primary !py-1 !px-2 text-xs" onClick={() => assignAndStart(s)}>
                            开始镟修
                          </button>
                          <button className="btn btn-ghost !py-1 !px-2 text-xs" onClick={() => setStatus(s, 'cancelled')}>取消</button>
                          <button className="btn btn-ghost !py-1 !px-2 text-xs text-signal-offline" onClick={() => remove(s)}>删除</button>
                        </div>
                      )}
                      {editable && s.status === 'in_progress' && (
                        <div className="flex justify-end gap-1.5">
                          <button className="btn btn-primary !py-1 !px-2 text-xs" onClick={() => setStatus(s, 'completed')}>
                            完成镟修
                          </button>
                          <button className="btn btn-ghost !py-1 !px-2 text-xs" onClick={() => setStatus(s, 'cancelled')}>取消</button>
                        </div>
                      )}
                      {(s.status === 'completed' || s.status === 'cancelled') && (
                        <Link to="/inspections" className="btn btn-ghost !py-1 !px-2 text-xs">质检 →</Link>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {schedules.length === 0 && <EmptyState text="暂无排程记录" />}
      </div>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="新建排程"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setModal(false)}>取消</button>
            <button className="btn btn-primary" onClick={submit} disabled={saving || !form.vehicle_id}>
              {saving ? '保存中…' : '创建排程'}
            </button>
          </>
        }
      >
        {err && <ErrorBanner message={err} onDismiss={() => setErr(null)} />}
        <Field label="车辆" hint="仅显示可排程车辆（上线 / 待镟修）">
          <select className="input" value={form.vehicle_id || ''} onChange={(e) => setForm((f) => ({ ...f, vehicle_id: e.target.value }))}>
            <option value="">请选择车辆…</option>
            {availableVehicles.map((v) => {
              const d = v.wheel_diameter_diff
              return (
                <option key={v.id} value={v.id}>
                  {v.vehicle_no} · {v.status}{d != null ? ` · 差${Number(d).toFixed(2)}mm${v.priority_flag ? ' · 优先' : ''}` : ''}
                </option>
              )
            })}
          </select>
        </Field>
        <Field label="机位" hint="可选 · 保养中或作业中机位不会出现在列表">
          <select className="input" value={form.machine_id || ''} onChange={(e) => setForm((f) => ({ ...f, machine_id: e.target.value }))}>
            <option value="">暂不分配</option>
            {idleMachines.map((m) => (
              <option key={m.id} value={m.id}>{m.machine_no} · {m.machine_name || '镟修机位'}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="排程日期">
            <input type="date" className="input" value={form.schedule_date || today} onChange={(e) => setForm((f) => ({ ...f, schedule_date: e.target.value }))} />
          </Field>
          <Field label="操作人">
            <input className="input" value={form.operator || ''} onChange={(e) => setForm((f) => ({ ...f, operator: e.target.value }))} placeholder="检修班人员" />
          </Field>
        </div>
        <Field label="备注">
          <input className="input" value={form.remark || ''} onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))} placeholder="可选" />
        </Field>
      </Modal>
    </div>
  )
}

function statusFromSchedule(s) {
  if (s.status === 'in_progress') return 'maintaining'
  if (s.status === 'completed') return 'waiting'
  if (s.priority_flag) return 'waiting'
  return 'online'
}
