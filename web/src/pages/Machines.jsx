import { useMemo, useState } from 'react'
import { api } from '../api/client.js'
import { useAsync } from '../lib/useAsync.js'
import { useRole } from '../lib/role.jsx'
import { SectionTitle, Pill, Loading, EmptyState, ErrorBanner, Modal, Field } from '../lib/ui.jsx'
import { MACHINE_STATUS, fmtNum } from '../lib/format.js'

export default function Machines() {
  const { can } = useRole()
  const editable = can('manageMachines')
  const { data: rows, loading, error, reload, setData } = useAsync(api.machines, [])
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const [slotMachineId, setSlotMachineId] = useState(null)
  const [slots, setSlots] = useState(null)

  const openCreate = () => {
    setForm({ machine_name: '', status: 'idle', maintenance_flag: 0, available_from: '', available_to: '', maintenance_reviewer: '' })
    setErr(null)
    setModal({ mode: 'create' })
  }
  const openEdit = (m) => {
    setForm({
      machine_name: m.machine_name,
      status: m.status,
      maintenance_flag: m.maintenance_flag || 0,
      available_from: m.available_from || '',
      available_to: m.available_to || '',
      maintenance_reviewer: m.maintenance_reviewer || '',
    })
    setErr(null)
    setModal({ mode: 'edit', id: m.id })
  }

  const submit = async () => {
    setSaving(true)
    setErr(null)
    const body = {
      machine_name: (form.machine_name || '').trim(),
      status: form.status || 'idle',
      maintenance_flag: Number(form.maintenance_flag) ? 1 : 0,
      available_from: form.available_from || null,
      available_to: form.available_to || null,
      maintenance_reviewer: form.maintenance_reviewer || null,
    }
    try {
      if (modal.mode === 'create') {
        const created = await api.createMachine(body)
        setData((d) => [created, ...(d || [])])
      } else {
        const updated = await api.updateMachine(modal.id, body)
        setData((d) => (d || []).map((x) => (x.id === modal.id ? updated : x)))
      }
      setModal(null)
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (m) => {
    if (!confirm(`确认删除镟修机 ${m.machine_name}？`)) return
    try {
      await api.deleteMachine(m.id)
      setData((d) => (d || []).filter((x) => x.id !== m.id))
    } catch (e) {
      alert(e.message)
    }
  }

  const viewSlots = async (m) => {
    setSlotMachineId(m.id)
    setSlots({ loading: true })
    try {
      const data = await api.machineSlots(m.id)
      setSlots(data)
    } catch (e) {
      setSlots({ error: e.message })
    }
  }

  const stats = useMemo(() => ({
    total: rows?.length || 0,
    idle: rows?.filter((m) => m.status === 'idle').length || 0,
    busy: rows?.filter((m) => m.status === 'busy').length || 0,
    maint: rows?.filter((m) => m.status === 'maintenance' || m.maintenance_flag).length || 0,
  }), [rows])

  if (loading || !rows) return <Loading />

  return (
    <div>
      <SectionTitle
        title="镟修机位"
        desc="机位状态 · 保养窗口 · 可用时间查询 · 紧急车辆主管复核"
        right={
          editable && (
            <button className="btn btn-primary" onClick={openCreate}>+ 新增机位</button>
          )
        }
      />
      {error && <ErrorBanner message={error} />}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: '机位总数', value: stats.total, tone: 'text-steel-200' },
          { label: '空闲', value: stats.idle, tone: 'text-signal-online' },
          { label: '作业中', value: stats.busy, tone: 'text-signal-maintaining' },
          { label: '保养中', value: stats.maint, tone: 'text-signal-offline' },
        ].map((c) => (
          <div key={c.label} className="panel !p-3">
            <div className="text-[10px] uppercase tracking-wider text-steel-400">{c.label}</div>
            <div className={`stat-num ${c.tone}`}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {rows.map((m) => {
          const isMaintaining = m.status === 'maintenance' || m.maintenance_flag
          return (
            <div key={m.id} className="panel">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-mono text-base text-steel-100">{m.machine_name}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <Pill map={MACHINE_STATUS} status={isMaintaining ? 'maintenance' : m.status} />
                    {m.maintenance_flag && <span className="text-[10px] text-signal-offline">🔧 维护标记</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-steel-400">待排程</div>
                  <div className="stat-num text-steel-200">{m.pending_count || 0}</div>
                </div>
              </div>
              <div className="mt-3 space-y-1 text-xs">
                {m.available_from && <div className="text-steel-400">
                  可用时段: <span className="font-mono text-steel-200">{m.available_from} ~ {m.available_to || '—'}</span>
                </div>}
                {m.maintenance_reviewer && <div className="text-steel-400">
                  主管复核人: <span className="text-steel-200">{m.maintenance_reviewer}</span>
                </div>}
                <div className="text-steel-400">
                  效率: <span className="font-mono text-steel-200">{fmtNum(m.efficiency)} 次/天</span>
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-1 border-t border-base-700 pt-3">
                <button className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => viewSlots(m)}>
                  可用窗口
                </button>
                {editable && (
                  <>
                    <button className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => openEdit(m)}>编辑</button>
                    <button className="btn btn-ghost !px-2 !py-1 text-xs text-signal-offline" onClick={() => remove(m)}>删除</button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {rows.length === 0 && <EmptyState text="暂无机位数据" />}

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.mode === 'create' ? '新增镟修机位' : '编辑镟修机位'}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setModal(null)}>取消</button>
            <button className="btn btn-primary" onClick={submit} disabled={saving || !(form.machine_name || '').trim()}>
              {saving ? '保存中…' : '保存'}
            </button>
          </>
        }
      >
        {err && <ErrorBanner message={err} onDismiss={() => setErr(null)} />}
        <Field label="机位名称">
          <input className="input" value={form.machine_name || ''}
            onChange={(e) => setForm((f) => ({ ...f, machine_name: e.target.value }))}
            placeholder="如 HGM-100-A" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="状态">
            <select className="input" value={form.status || 'idle'}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              <option value="idle">空闲</option>
              <option value="busy">作业中</option>
              <option value="maintenance">保养中</option>
            </select>
          </Field>
          <Field label="效率 (次/天)">
            <input type="number" min="1" className="input" value={form.efficiency || ''}
              onChange={(e) => setForm((f) => ({ ...f, efficiency: e.target.value }))} />
          </Field>
        </div>
        <Field label="保养标记">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={Number(form.maintenance_flag) === 1}
              onChange={(e) => setForm((f) => ({ ...f, maintenance_flag: e.target.checked ? 1 : 0 }))} />
            <span className="text-steel-200">标记为保养中（普通排程不可进入，紧急车辆需主管复核）</span>
          </label>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="可用时段 (从)">
            <input type="time" className="input" value={form.available_from || ''}
              onChange={(e) => setForm((f) => ({ ...f, available_from: e.target.value }))} />
          </Field>
          <Field label="可用时段 (至)">
            <input type="time" className="input" value={form.available_to || ''}
              onChange={(e) => setForm((f) => ({ ...f, available_to: e.target.value }))} />
          </Field>
        </div>
        <Field label="保养主管复核人" hint="紧急车辆在保养机位允许排程的审批责任人">
          <input className="input" value={form.maintenance_reviewer || ''}
            onChange={(e) => setForm((f) => ({ ...f, maintenance_reviewer: e.target.value }))}
            placeholder="如 张主管" />
        </Field>
      </Modal>

      <Modal
        open={!!slotMachineId}
        onClose={() => { setSlotMachineId(null); setSlots(null) }}
        title="机位可用窗口与排队情况"
        wide
      >
        {slots?.loading && <Loading />}
        {slots?.error && <ErrorBanner message={slots.error} />}
        {slots && !slots.loading && !slots.error && (
          <div>
            <div className="mb-3 flex flex-wrap gap-3 text-xs">
              <div className="text-steel-400">机位: <span className="font-mono text-steel-100">{slots.machine?.machine_name}</span></div>
              <div className="text-steel-400">状态: <span className="font-mono">{slots.machine?.status}</span></div>
              {slots.machine?.available_from && (
                <div className="text-steel-400">可用窗口: <span className="font-mono text-steel-100">{slots.machine.available_from} ~ {slots.machine.available_to}</span></div>
              )}
            </div>
            <div className="mb-2 text-xs font-semibold text-steel-200">排队中的排程 ({slots.queue?.length || 0})</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-base-700 text-left text-[10px] uppercase tracking-wider text-steel-400">
                    <th className="px-2 py-1.5">#</th>
                    <th className="px-2 py-1.5">车辆</th>
                    <th className="px-2 py-1.5">计划开始</th>
                    <th className="px-2 py-1.5">类型</th>
                    <th className="px-2 py-1.5">轮径差</th>
                  </tr>
                </thead>
                <tbody>
                  {(slots.queue || []).map((s, i) => (
                    <tr key={s.id} className="border-b border-base-800">
                      <td className="px-2 py-1.5 font-mono">{i + 1}</td>
                      <td className="px-2 py-1.5 font-mono text-steel-200">{s.vehicle_no}</td>
                      <td className="px-2 py-1.5 font-mono text-steel-300">{s.scheduled_start || '—'}</td>
                      <td className="px-2 py-1.5 text-steel-300">{s.schedule_type === 'emergency' ? '抢修' : '常规'}</td>
                      <td className="px-2 py-1.5 font-mono text-steel-300">{fmtNum(s.wheel_diameter_diff, 2)} mm</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(slots.queue || []).length === 0 && <EmptyState text="暂无排队排程" />}
          </div>
        )}
      </Modal>
    </div>
  )
}
