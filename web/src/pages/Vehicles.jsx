import { useMemo, useState } from 'react'
import { api } from '../api/client.js'
import { useAsync } from '../lib/useAsync.js'
import { useRole } from '../lib/role.jsx'
import { SectionTitle, Pill, Badge, Loading, EmptyState, ErrorBanner, Modal, Field } from '../lib/ui.jsx'
import { VEHICLE_STATUS, fmtNum, diffTone } from '../lib/format.js'

const STATUS_FILTERS = ['all', 'online', 'waiting', 'maintaining', 'offline']

export default function Vehicles() {
  const { can } = useRole()
  const editable = can('manageVehicles')
  const { data: rows, loading, error, reload, setData } = useAsync(api.vehicles, [])
  const [filter, setFilter] = useState('all')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const list = useMemo(() => {
    if (!rows) return []
    return filter === 'all' ? rows : rows.filter((v) => v.status === filter)
  }, [rows, filter])

  const openCreate = () => {
    setForm({ vehicle_no: '', wheel_diameter_left: '', wheel_diameter_right: '', status: 'online', emergency_flag: 0, online_plan_date: '' })
    setErr(null)
    setModal({ mode: 'create' })
  }
  const openEdit = (v) => {
    setForm({
      vehicle_no: v.vehicle_no,
      wheel_diameter_left: v.wheel_diameter_left ?? '',
      wheel_diameter_right: v.wheel_diameter_right ?? '',
      status: v.status,
      emergency_flag: v.emergency_flag || 0,
      online_plan_date: v.online_plan_date || '',
    })
    setErr(null)
    setModal({ mode: 'edit', id: v.id, locked: v.status === 'offline' })
  }

  const previewDiff = () => {
    const l = Number(form.wheel_diameter_left)
    const r = Number(form.wheel_diameter_right)
    if (!form.wheel_diameter_left || !form.wheel_diameter_right || Number.isNaN(l) || Number.isNaN(r)) return null
    return Math.abs(l - r)
  }
  const diff = previewDiff()

  const toggleEmergency = async (v) => {
    const next = v.emergency_flag ? 0 : 1
    if (next && !confirm(`确认将 ${v.vehicle_no} 标记为紧急车辆？将优先排程并可在保养机位走主管复核。`)) return
    try {
      const updated = await api.setVehicleEmergency(v.id, { emergency_flag: next })
      setData((d) => (d || []).map((x) => (x.id === v.id ? updated : x)))
    } catch (e) {
      alert(e.message)
    }
  }

  const submit = async () => {
    setSaving(true)
    setErr(null)
    const body = {
      vehicle_no: (form.vehicle_no || '').trim(),
      wheel_diameter_left: form.wheel_diameter_left === '' ? null : Number(form.wheel_diameter_left),
      wheel_diameter_right: form.wheel_diameter_right === '' ? null : Number(form.wheel_diameter_right),
      status: form.status || 'online',
      emergency_flag: Number(form.emergency_flag) ? 1 : 0,
      online_plan_date: form.online_plan_date || null,
    }
    try {
      if (modal.mode === 'create') {
        const created = await api.createVehicle(body)
        setData((d) => [created, ...(d || [])])
      } else {
        const updated = await api.updateVehicle(modal.id, body)
        setData((d) => (d || []).map((x) => (x.id === modal.id ? updated : x)))
      }
      setModal(null)
      reload()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (v) => {
    if (!confirm(`确认删除车辆 ${v.vehicle_no}？`)) return
    try {
      await api.deleteVehicle(v.id)
      setData((d) => (d || []).filter((x) => x.id !== v.id))
    } catch (e) {
      alert(e.message)
    }
  }

  if (loading || !rows) return <Loading />

  return (
    <div>
      <SectionTitle
        title="车辆档案"
        desc="调度员录入左右轮径 · 系统自动计算差值与优先级 · 维护上线计划与紧急标记"
        right={
          editable && (
            <button className="btn btn-primary" onClick={openCreate}>
              + 新增车辆
            </button>
          )
        }
      />
      {error && <ErrorBanner message={error} />}

      <div className="mb-4 flex flex-wrap gap-1.5">
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
            {f === 'all' ? '全部' : VEHICLE_STATUS[f].label}
            <span className="ml-1.5 font-mono text-steel-400">
              {f === 'all' ? rows.length : rows.filter((v) => v.status === f).length}
            </span>
          </button>
        ))}
      </div>

      <div className="panel">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-base-700 text-left text-[11px] uppercase tracking-wider text-steel-400">
                <th className="px-4 py-2.5">车辆编号</th>
                <th className="px-4 py-2.5">状态</th>
                <th className="px-4 py-2.5">左轮径</th>
                <th className="px-4 py-2.5">右轮径</th>
                <th className="px-4 py-2.5">轮径差</th>
                <th className="px-4 py-2.5">上线计划</th>
                <th className="px-4 py-2.5">优先级</th>
                <th className="px-4 py-2.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((v) => {
                const tone = diffTone(v.wheel_diameter_diff)
                return (
                  <tr key={v.id} className="table-row">
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-steel-200">{v.vehicle_no}</span>
                      {v.status === 'offline' && (
                        <span className="ml-2 text-[10px] text-signal-offline">🔒 锁定</span>
                      )}
                      {v.emergency_flag && (
                        <span className="ml-2 text-[10px] text-red-300">🚨 紧急</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5"><Pill map={VEHICLE_STATUS} status={v.status} /></td>
                    <td className="px-4 py-2.5 font-mono text-steel-300">{fmtNum(v.wheel_diameter_left)}</td>
                    <td className="px-4 py-2.5 font-mono text-steel-300">{fmtNum(v.wheel_diameter_right)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`stat-num ${tone.text}`}>{fmtNum(v.wheel_diameter_diff, 2)}</span>
                      <span className={`ml-1.5 text-[10px] ${tone.text}`}>{tone.label}</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-steel-300">{v.online_plan_date || '—'}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {v.priority_flag ? <Badge tone="amber">超阈优先</Badge> : null}
                        {v.emergency_flag ? <Badge tone="red">抢修优先</Badge> : null}
                        {!v.priority_flag && !v.emergency_flag ? <span className="text-steel-400">—</span> : null}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {editable && (
                        <div className="flex justify-end gap-1">
                          <button className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => toggleEmergency(v)}
                            title={v.emergency_flag ? '取消紧急标记' : '标记为紧急车辆'}>
                            {v.emergency_flag ? '取消紧急' : '标记紧急'}
                          </button>
                          <button className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => openEdit(v)}>
                            编辑
                          </button>
                          <button className="btn btn-ghost !px-2 !py-1 text-xs text-signal-offline" onClick={() => remove(v)}>
                            删除
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {list.length === 0 && <EmptyState text="暂无符合条件的车辆" />}
      </div>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.mode === 'create' ? '新增车辆' : '编辑车辆'}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setModal(null)}>取消</button>
            <button className="btn btn-primary" onClick={submit} disabled={saving || !(form.vehicle_no || '').trim()}>
              {saving ? '保存中…' : '保存'}
            </button>
          </>
        }
      >
        {err && <ErrorBanner message={err} onDismiss={() => setErr(null)} />}
        <Field label="车辆编号">
          <input
            className="input"
            value={form.vehicle_no || ''}
            onChange={(e) => setForm((f) => ({ ...f, vehicle_no: e.target.value }))}
            placeholder="如 G2024-07"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="左轮径 (mm)">
            <input
              className="input"
              type="number"
              step="0.01"
              value={form.wheel_diameter_left || ''}
              onChange={(e) => setForm((f) => ({ ...f, wheel_diameter_left: e.target.value }))}
              placeholder="如 840.00"
            />
          </Field>
          <Field label="右轮径 (mm)">
            <input
              className="input"
              type="number"
              step="0.01"
              value={form.wheel_diameter_right || ''}
              onChange={(e) => setForm((f) => ({ ...f, wheel_diameter_right: e.target.value }))}
              placeholder="如 836.50"
            />
          </Field>
        </div>
        {diff != null && (
          <div className="mb-3 border border-base-700 bg-base-900/60 px-3 py-2 text-xs">
            <span className="text-steel-400">实时计算 · 轮径差：</span>
            <span className={`stat-num ${diffTone(diff).text}`}>{diff.toFixed(2)} mm</span>
            <span className={`ml-2 ${diffTone(diff).text}`}>
              {diffTone(diff).label}
              {diffTone(diff).label === '超阈' ? ' · 将标记优先排程' : ''}
            </span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="上线计划日期" hint="用于排程优先级排序">
            <input
              type="date"
              className="input"
              value={form.online_plan_date || ''}
              onChange={(e) => setForm((f) => ({ ...f, online_plan_date: e.target.value }))}
            />
          </Field>
          <Field label="车辆状态" hint={modal?.locked ? '该车辆处于下线锁定，质检合格后方可上线' : undefined}>
            <select
              className="input"
              value={form.status || 'online'}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="online">上线</option>
              <option value="waiting">待镟修</option>
              <option value="maintaining">镟修中</option>
              <option value="offline">下线锁定</option>
            </select>
          </Field>
        </div>
        <Field label="紧急标记">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Number(form.emergency_flag) === 1}
              onChange={(e) => setForm((f) => ({ ...f, emergency_flag: e.target.checked ? 1 : 0 }))}
            />
            <span className="text-steel-200">标记为抢修紧急车辆（可插队，可走保养机位主管复核）</span>
          </label>
        </Field>
      </Modal>
    </div>
  )
}
