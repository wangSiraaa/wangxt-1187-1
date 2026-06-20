import { useState } from 'react'
import { api } from '../api/client.js'
import { useAsync } from '../lib/useAsync.js'
import { useRole } from '../lib/role.jsx'
import { SectionTitle, Pill, Badge, Loading, EmptyState, ErrorBanner } from '../lib/ui.jsx'
import { INSPECTION_RESULT, fmtNum, diffTone } from '../lib/format.js'

export default function Inspections() {
  const { can } = useRole()
  const editable = can('manageInspections')
  const { data: rows, loading, error, reload } = useAsync(api.inspections, [])
  const { data: params } = useAsync(api.sysparams, [])
  const [drafts, setDrafts] = useState({})
  const [saving, setSaving] = useState(null)
  const [err, setErr] = useState(null)

  const threshold = Number(params?.find((p) => p.param_key === 'wheel_diameter_diff_threshold')?.param_value) || 3.0

  const draft = (i) =>
    drafts[i.id] || {
      post_diameter_left: i.post_diameter_left ?? '',
      post_diameter_right: i.post_diameter_right ?? '',
      result: 'pass',
      inspector: i.inspector || '',
      remark: '',
    }
  const setDraft = (id, patch) => setDrafts((d) => ({ ...d, [id]: { ...draft({ id, ...drafts[id] }), ...patch } }))

  const postDiff = (i) => {
    const d = drafts[i.id] || {}
    const l = Number(d.post_diameter_left)
    const r = Number(d.post_diameter_right)
    if (d.post_diameter_left === '' || d.post_diameter_right === '' || Number.isNaN(l) || Number.isNaN(r)) return null
    return Math.abs(l - r)
  }

  const confirm = async (i) => {
    const d = draft(i)
    if (d.post_diameter_left === '' || d.post_diameter_right === '') {
      setErr('请录入修后左右轮径')
      return
    }
    setSaving(i.id)
    setErr(null)
    try {
      await api.updateInspection(i.id, {
        post_diameter_left: Number(d.post_diameter_left),
        post_diameter_right: Number(d.post_diameter_right),
        result: d.result || 'pending',
        inspector: (d.inspector || '').trim() || null,
        remark: (d.remark || '').trim() || null,
      })
      setDrafts((x) => {
        const { [i.id]: _, ...rest } = x
        return rest
      })
      reload()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(null)
    }
  }

  if (loading || !rows) return <Loading />

  const counts = {
    pending: rows.filter((r) => r.result === 'pending').length,
    pass: rows.filter((r) => r.result === 'pass').length,
    fail: rows.filter((r) => r.result === 'fail').length,
  }

  return (
    <div>
      <SectionTitle
        title="质检确认"
        desc="质检员录入修后轮径并判定 · 合格上线 / 不合格下线锁定"
        right={<Badge tone="amber">阈值 {threshold}mm</Badge>}
      />
      {error && <ErrorBanner message={error} onDismiss={() => setErr(null)} />}
      {err && <ErrorBanner message={err} onDismiss={() => setErr(null)} />}

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="panel p-3"><div className="text-[11px] text-steel-400">待质检</div><div className="stat-num text-2xl text-signal-pending">{counts.pending}</div></div>
        <div className="panel p-3"><div className="text-[11px] text-steel-400">合格</div><div className="stat-num text-2xl text-signal-online">{counts.pass}</div></div>
        <div className="panel p-3"><div className="text-[11px] text-steel-400">不合格</div><div className="stat-num text-2xl text-signal-offline">{counts.fail}</div></div>
      </div>

      <div className="space-y-3">
        {rows.map((i) => {
          const isPending = i.result === 'pending'
          const d = draft(i)
          const pdiff = postDiff(i)
          const preDiff = i.pre_diameter_left != null && i.pre_diameter_right != null ? Math.abs(i.pre_diameter_left - i.pre_diameter_right) : null
          const savedDiff = i.post_diameter_diff
          return (
            <div key={i.id} className={`panel p-4 ${i.result === 'fail' ? 'border-signal-offline/40' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="h-title text-base text-steel-200">{i.vehicle_no}</span>
                      {i.priority_flag ? <Badge tone="red">优先</Badge> : null}
                    </div>
                    <div className="text-[11px] text-steel-400">
                      排程 #{i.schedule_id} · {i.machine_no || '未分配机位'} · {i.schedule_date || '—'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Pill map={INSPECTION_RESULT} status={i.result} />
                  {i.result === 'fail' && <span className="text-[11px] text-signal-offline">🔒 车辆已下线锁定</span>}
                  {i.result === 'pass' && <span className="text-[11px] text-signal-online">✓ 车辆已上线</span>}
                </div>
              </div>

              <div className="mt-3 grid gap-4 lg:grid-cols-2">
                <div className="border border-base-800 bg-base-900/50 p-3">
                  <div className="mb-2 text-[11px] uppercase tracking-wider text-steel-400">修前轮径</div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div><div className="text-[10px] text-steel-400">左</div><div className="font-mono text-steel-300">{fmtNum(i.pre_diameter_left)} mm</div></div>
                    <div><div className="text-[10px] text-steel-400">右</div><div className="font-mono text-steel-300">{fmtNum(i.pre_diameter_right)} mm</div></div>
                    <div>
                      <div className="text-[10px] text-steel-400">差值</div>
                      <div className={`font-mono ${diffTone(preDiff, threshold).text}`}>{fmtNum(preDiff, 2)} mm</div>
                    </div>
                  </div>
                </div>

                <div className="border border-base-800 bg-base-900/50 p-3">
                  <div className="mb-2 text-[11px] uppercase tracking-wider text-steel-400">修后轮径</div>
                  {isPending && editable ? (
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <div className="text-[10px] text-steel-400">左</div>
                        <input type="number" step="0.01" className="input !py-1 text-sm" value={d.post_diameter_left} onChange={(e) => setDraft(i.id, { post_diameter_left: e.target.value })} placeholder="mm" />
                      </div>
                      <div>
                        <div className="text-[10px] text-steel-400">右</div>
                        <input type="number" step="0.01" className="input !py-1 text-sm" value={d.post_diameter_right} onChange={(e) => setDraft(i.id, { post_diameter_right: e.target.value })} placeholder="mm" />
                      </div>
                      <div>
                        <div className="text-[10px] text-steel-400">差值</div>
                        <div className={`font-mono text-sm pt-2 ${diffTone(pdiff, threshold).text}`}>{pdiff != null ? `${pdiff.toFixed(2)} mm` : '—'}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div><div className="text-[10px] text-steel-400">左</div><div className="font-mono text-steel-300">{fmtNum(i.post_diameter_left)} mm</div></div>
                      <div><div className="text-[10px] text-steel-400">右</div><div className="font-mono text-steel-300">{fmtNum(i.post_diameter_right)} mm</div></div>
                      <div><div className="text-[10px] text-steel-400">差值</div><div className={`font-mono ${diffTone(savedDiff, threshold).text}`}>{fmtNum(savedDiff, 2)} mm</div></div>
                    </div>
                  )}
                </div>
              </div>

              {isPending && editable && (
                <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-base-800 pt-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <div className="label mb-1">质检人</div>
                      <input className="input !py-1 !w-40 text-sm" value={d.inspector} onChange={(e) => setDraft(i.id, { inspector: e.target.value })} placeholder="质检员姓名" />
                    </div>
                    <div>
                      <div className="label mb-1">判定结果</div>
                      <select className="input !py-1 !w-32 text-sm" value={d.result} onChange={(e) => setDraft(i.id, { result: e.target.value })}>
                        <option value="pass">合格</option>
                        <option value="fail">不合格</option>
                      </select>
                    </div>
                    <div>
                      <div className="label mb-1">备注</div>
                      <input className="input !py-1 !w-44 text-sm" value={d.remark || ''} onChange={(e) => setDraft(i.id, { remark: e.target.value })} placeholder="可选" />
                    </div>
                  </div>
                  <button className="btn btn-primary" onClick={() => confirm(i)} disabled={saving === i.id}>
                    {saving === i.id ? '提交中…' : '确认质检'}
                  </button>
                </div>
              )}

              {i.result !== 'pending' && (
                <div className="mt-3 border-t border-base-800 pt-2 text-xs text-steel-400">
                  质检人：{i.inspector || '—'} · 时间：{i.inspected_at || '—'}
                  {i.remark ? <span className="ml-2 text-steel-300">备注：{i.remark}</span> : null}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {rows.length === 0 && <EmptyState text="暂无质检记录" />}
    </div>
  )
}
