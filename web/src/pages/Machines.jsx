import { useState } from 'react'
import { api } from '../api/client.js'
import { useAsync } from '../lib/useAsync.js'
import { useRole } from '../lib/role.jsx'
import { SectionTitle, Pill, Badge, Loading, EmptyState, ErrorBanner, Modal, Field } from '../lib/ui.jsx'
import { MACHINE_STATUS } from '../lib/format.js'

export default function Machines() {
  const { can } = useRole()
  const editable = can('manageMachines')
  const { data: rows, loading, error, reload, setData } = useAsync(api.machines, [])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ machine_no: '', machine_name: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const toggleMaintenance = async (m) => {
    const next = m.maintenance_flag ? 0 : 1
    if (next === 1 && !confirm(`确认将 ${m.machine_no} 设为保养状态？保养期间禁止排车。`)) return
    try {
      const updated = await api.updateMachine(m.id, { maintenance_flag: next })
      setData((d) => (d || []).map((x) => (x.id === m.id ? { ...x, ...updated, current_vehicle_no: x.current_vehicle_no } : x)))
      reload()
    } catch (e) {
      alert(e.message)
    }
  }

  const submit = async () => {
    setSaving(true)
    setErr(null)
    try {
      const created = await api.createMachine({
        machine_no: (form.machine_no || '').trim(),
        machine_name: (form.machine_name || '').trim() || null,
      })
      setData((d) => [...(d || []), { ...created, current_vehicle_no: null }])
      setModal(false)
      setForm({ machine_no: '', machine_name: '' })
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (m) => {
    if (!confirm(`确认删除机位 ${m.machine_no}？`)) return
    try {
      await api.deleteMachine(m.id)
      setData((d) => (d || []).filter((x) => x.id !== m.id))
    } catch (e) {
      alert(e.message)
    }
  }

  if (loading || !rows) return <Loading />

  return (
    <div>
      <SectionTitle
        title="镟修机位"
        desc="机位状态与保养管理 · 保养中机位禁止排车"
        right={
          editable && (
            <button className="btn btn-primary" onClick={() => setModal(true)}>
              + 新增机位
            </button>
          )
        }
      />
      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((m) => {
          const underMaintenance = m.maintenance_flag
          return (
            <div
              key={m.id}
              className={`relative panel p-4 ${underMaintenance ? 'border-signal-offline/40' : 'border-base-700'}`}
            >
              {underMaintenance && (
                <div className="absolute -inset-px pointer-events-none border border-signal-offline/30" />
              )}
              <div className="flex items-start justify-between">
                <div>
                  <div className="h-title text-lg text-steel-200">{m.machine_no}</div>
                  <div className="text-[11px] text-steel-400">{m.machine_name || '镟修机位'}</div>
                </div>
                <Pill map={MACHINE_STATUS} status={m.status} />
              </div>

              <div className="my-3 border-t border-base-800 pt-3">
                {m.current_vehicle_no ? (
                  <div className="text-xs">
                    <div className="text-steel-400">当前作业车辆</div>
                    <div className="font-mono text-sm text-amber-glow">{m.current_vehicle_no}</div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`h-1.5 w-1.5 rounded-full ${underMaintenance ? 'bg-signal-offline' : 'bg-signal-online'}`} />
                    <span className={underMaintenance ? 'text-signal-offline' : 'text-steel-400'}>
                      {underMaintenance ? '保养维护中 · 禁止排车' : '空闲待命'}
                    </span>
                  </div>
                )}
              </div>

              {editable && (
                <div className="flex gap-1.5">
                  <button
                    className="btn flex-1 !py-1.5 text-xs"
                    onClick={() => toggleMaintenance(m)}
                    disabled={!!m.current_vehicle_id && !underMaintenance}
                    title={m.current_vehicle_id && !underMaintenance ? '机位有车作业中，无法保养' : ''}
                  >
                    {underMaintenance ? '结束保养' : '开始保养'}
                  </button>
                  <button
                    className="btn btn-ghost !px-2 !py-1.5 text-xs text-signal-offline"
                    onClick={() => remove(m)}
                    disabled={!!m.current_vehicle_id}
                  >
                    删除
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {rows.length === 0 && <EmptyState text="暂无机位，请新增" />}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="新增镟修机位"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setModal(false)}>取消</button>
            <button className="btn btn-primary" onClick={submit} disabled={saving || !(form.machine_no || '').trim()}>
              {saving ? '保存中…' : '保存'}
            </button>
          </>
        }
      >
        {err && <ErrorBanner message={err} onDismiss={() => setErr(null)} />}
        <Field label="机位编号">
          <input
            className="input"
            value={form.machine_no}
            onChange={(e) => setForm((f) => ({ ...f, machine_no: e.target.value }))}
            placeholder="如 L04"
          />
        </Field>
        <Field label="机位名称">
          <input
            className="input"
            value={form.machine_name}
            onChange={(e) => setForm((f) => ({ ...f, machine_name: e.target.value }))}
            placeholder="如 4号镟修机"
          />
        </Field>
      </Modal>
    </div>
  )
}
