import { useState } from 'react'
import { api } from '../api/client.js'
import { useAsync } from '../lib/useAsync.js'
import { useRole } from '../lib/role.jsx'
import { SectionTitle, Loading, Field, ErrorBanner } from '../lib/ui.jsx'

const META = {
  wheel_diameter_diff_threshold: { label: '轮径差阈值', unit: 'mm', desc: '左右轮径差超过该值则标记为优先排程' },
  standard_wheel_diameter: { label: '标准轮径', unit: 'mm', desc: '新轮标准直径参考值' },
  min_wheel_diameter: { label: '最小允许轮径', unit: 'mm', desc: '低于该值需报废，不可镟修' },
}

export default function Settings() {
  const { can } = useRole()
  const { data: rows, loading, reload } = useAsync(api.sysparams, [])
  const editable = can('manageSettings')
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)

  if (loading || !rows) return <Loading />

  const merged = rows.reduce((acc, r) => {
    acc[r.param_key] = r
    return acc
  }, {})
  const keys = Object.keys(META)

  const val = (k) => (form[k] != null ? form[k] : merged[k]?.param_value ?? '')

  const submit = async () => {
    setSaving(true)
    setErr(null)
    setMsg(null)
    const body = {}
    for (const k of keys) body[k] = val(k)
    try {
      await api.updateSysparams(body)
      setMsg('参数已保存，将在新一轮排程与质检中生效')
      setForm({})
      reload()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <SectionTitle
        title="系统参数"
        desc="轮径阈值与标准值配置 · 全局生效"
        right={!editable && <span className="text-xs text-steel-400">仅调度长可修改</span>}
      />
      {err && <ErrorBanner message={err} onDismiss={() => setErr(null)} />}
      {msg && (
        <div className="mb-4 border border-signal-online/50 bg-signal-online/10 px-3 py-2 text-sm text-signal-online">
          ✓ {msg}
        </div>
      )}

      <div className="panel panel-accent p-5">
        {keys.map((k) => (
          <Field key={k} label={META[k].label} hint={META[k].desc}>
            <div className="flex items-center gap-2">
              <input
                className="input"
                type="number"
                step="0.1"
                disabled={!editable}
                value={val(k)}
                onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
              />
              <span className="font-mono text-xs text-steel-400">{META[k].unit}</span>
            </div>
          </Field>
        ))}

        <div className="mt-4 flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={() => setForm({})} disabled={!editable}>
            重置
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={!editable || saving}>
            {saving ? '保存中…' : '保存参数'}
          </button>
        </div>
      </div>

      <div className="mt-4 panel p-4 text-xs text-steel-400">
        <div className="h-title mb-2 text-steel-300">规则说明</div>
        <ul className="list-disc space-y-1 pl-4 leading-relaxed">
          <li>轮径差 = |左轮径 − 右轮径|，超过阈值时 priority_flag = 1 并自动进入待镟修队列。</li>
          <li>镟修机位 maintenance_flag = 1 时禁止排车，需先结束保养恢复空闲。</li>
          <li>质检结果为不合格时车辆 status = offline（下线锁定），无法直接改回上线，须重新镟修并质检合格。</li>
        </ul>
      </div>
    </div>
  )
}
