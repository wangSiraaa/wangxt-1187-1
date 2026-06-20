import { useState } from 'react'
import { api } from '../api/client.js'
import { useAsync } from '../lib/useAsync.js'
import { useRole } from '../lib/role.jsx'
import { SectionTitle, Pill, Badge, Loading, EmptyState, ErrorBanner, Modal, Field } from '../lib/ui.jsx'
import { INSPECTION_RESULT, DIMENSION_REVIEW_STATUS, REWORK_TASK_STATUS, fmtNum, diffTone } from '../lib/format.js'

export default function Inspections() {
  const { can, role } = useRole()
  const editable = can('createInspections')
  const canApprove = can('approveInspections') || role === 'chief'
  const { data: rows, loading, error, reload, setData } = useAsync(api.inspections, [])
  const { data: vehicles } = useAsync(api.vehicles, [])
  const { data: schedules } = useAsync(api.schedules, [])

  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const [reviewModal, setReviewModal] = useState(null)
  const [reviewData, setReviewData] = useState(null)
  const [reviewForm, setReviewForm] = useState({ status: 'pass', remark: '' })

  const openCreate = () => {
    const waiting = (schedules || []).filter((s) => s.status === 'in_progress' || s.status === 'completed')
    setForm({
      vehicle_id: vehicles?.[0]?.id || '',
      schedule_id: waiting[0]?.id || '',
      inspector: '',
      result: 'pending',
      pre_left_diameter: '',
      pre_right_diameter: '',
      post_left_diameter: '',
      post_right_diameter: '',
      wear_left: '',
      wear_right: '',
      remark: '',
    })
    setErr(null)
    setModal({ mode: 'create' })
  }

  const openEdit = (i) => {
    setForm({
      vehicle_id: i.vehicle_id,
      schedule_id: i.schedule_id || '',
      inspector: i.inspector || '',
      result: i.result || 'pending',
      pre_left_diameter: i.pre_left_diameter ?? '',
      pre_right_diameter: i.pre_right_diameter ?? '',
      post_left_diameter: i.post_left_diameter ?? '',
      post_right_diameter: i.post_right_diameter ?? '',
      wear_left: i.wear_left ?? '',
      wear_right: i.wear_right ?? '',
      remark: i.remark || '',
    })
    setErr(null)
    setModal({ mode: 'edit', id: i.id })
  }

  const submit = async () => {
    setSaving(true)
    setErr(null)
    const num = (v) => (v === '' || v == null ? null : Number(v))
    const body = {
      vehicle_id: Number(form.vehicle_id),
      schedule_id: form.schedule_id ? Number(form.schedule_id) : null,
      inspector: (form.inspector || '').trim() || null,
      result: form.result || 'pending',
      pre_left_diameter: num(form.pre_left_diameter),
      pre_right_diameter: num(form.pre_right_diameter),
      post_left_diameter: num(form.post_left_diameter),
      post_right_diameter: num(form.post_right_diameter),
      wear_left: num(form.wear_left),
      wear_right: num(form.wear_right),
      remark: form.remark || null,
    }
    try {
      if (modal.mode === 'create') {
        await api.createInspection(body)
      } else {
        await api.updateInspection(modal.id, body)
      }
      setModal(null)
      reload()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  const loadReviews = async (i) => {
    setReviewModal({ id: i.id, vehicle_no: i.vehicle_no })
    setReviewForm({ status: 'pass', remark: '' })
    setReviewData({ loading: true })
    try {
      const data = await api.inspectionReviews(i.id)
      setReviewData(data)
    } catch (e) {
      setReviewData({ error: e.message })
    }
  }

  const submitReview = async () => {
    if (!reviewForm.remark || !reviewForm.remark.trim()) {
      alert('请输入复核意见')
      return
    }
    try {
      await api.createDimensionReview(reviewModal.id, {
        status: reviewForm.status,
        remark: reviewForm.remark,
        reviewer: '当前用户',
      })
      reload()
      loadReviews({ id: reviewModal.id, vehicle_no: reviewModal.vehicle_no })
    } catch (e) {
      alert(e.message)
    }
  }

  if (loading || !rows) return <Loading />

  const stats = {
    total: rows.length,
    pending: rows.filter((i) => i.result === 'pending').length,
    pass: rows.filter((i) => i.result === 'pass').length,
    fail: rows.filter((i) => i.result === 'fail').length,
  }

  return (
    <div>
      <SectionTitle
        title="尺寸质检"
        desc="修前/修后轮径与磨耗录入 · 质检员判定 · 主管尺寸复核 · 不合格自动返修"
        right={editable && <button className="btn btn-primary" onClick={openCreate}>+ 新增质检</button>}
      />
      {error && <ErrorBanner message={error} />}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: '质检总数', value: stats.total, tone: 'text-steel-200' },
          { label: '待判定', value: stats.pending, tone: 'text-signal-pending' },
          { label: '合格', value: stats.pass, tone: 'text-signal-online' },
          { label: '不合格', value: stats.fail, tone: 'text-signal-offline' },
        ].map((c) => (
          <div key={c.label} className="panel !p-3">
            <div className="text-[10px] uppercase tracking-wider text-steel-400">{c.label}</div>
            <div className={`stat-num ${c.tone}`}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-base-700 text-left text-[11px] uppercase tracking-wider text-steel-400">
                <th className="px-4 py-2.5">车辆</th>
                <th className="px-4 py-2.5">判定</th>
                <th className="px-4 py-2.5">修前(左/右)</th>
                <th className="px-4 py-2.5">修后(左/右)</th>
                <th className="px-4 py-2.5">磨耗(左/右)</th>
                <th className="px-4 py-2.5">质检员</th>
                <th className="px-4 py-2.5">复核</th>
                <th className="px-4 py-2.5">返修</th>
                <th className="px-4 py-2.5">时间</th>
                <th className="px-4 py-2.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => {
                const preTone = diffTone(
                  i.pre_left_diameter != null && i.pre_right_diameter != null
                    ? Math.abs(i.pre_left_diameter - i.pre_right_diameter)
                    : null
                )
                const postTone = diffTone(
                  i.post_left_diameter != null && i.post_right_diameter != null
                    ? Math.abs(i.post_left_diameter - i.post_right_diameter)
                    : null
                )
                return (
                  <tr key={i.id} className="table-row">
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-steel-200">{i.vehicle_no}</span>
                      {i.is_recheck && <span className="ml-1 text-[10px] text-signal-pending">复核</span>}
                    </td>
                    <td className="px-4 py-2.5"><Pill map={INSPECTION_RESULT} status={i.result} /></td>
                    <td className="px-4 py-2.5">
                      <div className="font-mono text-xs text-steel-300">
                        {fmtNum(i.pre_left_diameter)} / {fmtNum(i.pre_right_diameter)}
                      </div>
                      {i.pre_left_diameter != null && i.pre_right_diameter != null && (
                        <div className={`text-[10px] ${preTone.text}`}>
                          差 {Math.abs(i.pre_left_diameter - i.pre_right_diameter).toFixed(2)} ({preTone.label})
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-mono text-xs text-steel-300">
                        {fmtNum(i.post_left_diameter)} / {fmtNum(i.post_right_diameter)}
                      </div>
                      {i.post_left_diameter != null && i.post_right_diameter != null && (
                        <div className={`text-[10px] ${postTone.text}`}>
                          差 {Math.abs(i.post_left_diameter - i.post_right_diameter).toFixed(2)} ({postTone.label})
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-steel-300">
                      {fmtNum(i.wear_left)} / {fmtNum(i.wear_right)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-steel-400">{i.inspector || '—'}</td>
                    <td className="px-4 py-2.5">
                      {i.dimension_review_status && i.dimension_review_status !== 'pending' ? (
                        <Pill map={DIMENSION_REVIEW_STATUS} status={i.dimension_review_status} />
                      ) : (
                        <span className="text-xs text-steel-500">
                          {i.review_count ? `${i.review_count} 次` : '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {i.rework_task_id ? (
                        <Pill map={REWORK_TASK_STATUS} status={i.rework_task_status || 'pending'} />
                      ) : (
                        <span className="text-xs text-steel-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-steel-400">{i.created_at || '—'}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <div className="flex justify-end gap-1">
                        {canApprove && i.result !== 'pending' && (
                          <button className="btn btn-ghost !px-2 !py-1 text-xs text-signal-waiting" onClick={() => loadReviews(i)}>
                            尺寸复核
                          </button>
                        )}
                        {editable && (
                          <>
                            <button className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => openEdit(i)}>编辑</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <EmptyState text="暂无质检数据" />}
      </div>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.mode === 'create' ? '新增质检记录' : '编辑质检记录'}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setModal(null)}>取消</button>
            <button className="btn btn-primary" onClick={submit} disabled={saving || !form.vehicle_id}>
              {saving ? '保存中…' : '保存'}
            </button>
          </>
        }
      >
        {err && <ErrorBanner message={err} onDismiss={() => setErr(null)} />}
        <div className="grid grid-cols-2 gap-3">
          <Field label="车辆">
            <select className="input" value={form.vehicle_id || ''}
              onChange={(e) => setForm((f) => ({ ...f, vehicle_id: e.target.value }))}>
              <option value="">请选择车辆</option>
              {(vehicles || []).map((v) => (
                <option key={v.id} value={v.id}>{v.vehicle_no}</option>
              ))}
            </select>
          </Field>
          <Field label="关联排程 (可选)">
            <select className="input" value={form.schedule_id || ''}
              onChange={(e) => setForm((f) => ({ ...f, schedule_id: e.target.value }))}>
              <option value="">不关联</option>
              {(schedules || []).map((s) => (
                <option key={s.id} value={s.id}>#{s.id} {s.vehicle_no} - {s.machine_name}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="质检员">
          <input className="input" value={form.inspector || ''}
            onChange={(e) => setForm((f) => ({ ...f, inspector: e.target.value }))}
            placeholder="质检员姓名" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="判定结果">
            <select className="input" value={form.result || 'pending'}
              onChange={(e) => setForm((f) => ({ ...f, result: e.target.value }))}>
              <option value="pending">待判定</option>
              <option value="pass">合格（放行）</option>
              <option value="fail">不合格（锁定车辆并生成返修）</option>
            </select>
          </Field>
        </div>
        <div className="border-t border-base-700 my-3 pt-3">
          <div className="text-xs text-steel-400 mb-2">修前轮径 (mm)</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="左轮">
              <input type="number" step="0.01" className="input" value={form.pre_left_diameter}
                onChange={(e) => setForm((f) => ({ ...f, pre_left_diameter: e.target.value }))} />
            </Field>
            <Field label="右轮">
              <input type="number" step="0.01" className="input" value={form.pre_right_diameter}
                onChange={(e) => setForm((f) => ({ ...f, pre_right_diameter: e.target.value }))} />
            </Field>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-steel-400 mb-2">修后轮径 (mm)</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="左轮">
                <input type="number" step="0.01" className="input" value={form.post_left_diameter}
                  onChange={(e) => setForm((f) => ({ ...f, post_left_diameter: e.target.value }))} />
              </Field>
              <Field label="右轮">
                <input type="number" step="0.01" className="input" value={form.post_right_diameter}
                  onChange={(e) => setForm((f) => ({ ...f, post_right_diameter: e.target.value }))} />
              </Field>
            </div>
          </div>
          <div>
            <div className="text-xs text-steel-400 mb-2">磨耗量 (mm)</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="左轮">
                <input type="number" step="0.01" className="input" value={form.wear_left}
                  onChange={(e) => setForm((f) => ({ ...f, wear_left: e.target.value }))} />
              </Field>
              <Field label="右轮">
                <input type="number" step="0.01" className="input" value={form.wear_right}
                  onChange={(e) => setForm((f) => ({ ...f, wear_right: e.target.value }))} />
              </Field>
            </div>
          </div>
        </div>
        <Field label="备注">
          <textarea className="input" rows="2" value={form.remark || ''}
            onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))} />
        </Field>
      </Modal>

      <Modal
        open={!!reviewModal}
        onClose={() => { setReviewModal(null); setReviewData(null) }}
        title={`尺寸复核 · ${reviewModal?.vehicle_no || ''}`}
        wide
      >
        {reviewData?.loading && <Loading />}
        {reviewData?.error && <ErrorBanner message={reviewData.error} />}
        {reviewData && !reviewData.loading && !reviewData.error && (
          <div>
            <div className="mb-4 border border-signal-waiting/40 bg-signal-waiting/5 p-3 rounded-sm">
              <div className="text-xs text-signal-waiting font-semibold mb-2">提交新复核</div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="复核结论">
                  <select className="input" value={reviewForm.status}
                    onChange={(e) => setReviewForm((f) => ({ ...f, status: e.target.value }))}>
                    <option value="pass">复核通过</option>
                    <option value="fail">复核不通过（保持锁定）</option>
                  </select>
                </Field>
              </div>
              <Field label="复核意见">
                <textarea className="input" rows="2" value={reviewForm.remark}
                  onChange={(e) => setReviewForm((f) => ({ ...f, remark: e.target.value }))}
                  placeholder="请输入复核意见..." />
              </Field>
              <div className="flex justify-end">
                <button className="btn btn-primary" onClick={submitReview}>提交复核</button>
              </div>
            </div>

            <div className="text-xs font-semibold text-steel-200 mb-2">复核历史 ({(reviewData || []).length})</div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {(reviewData || []).length === 0 && <EmptyState text="暂无复核记录" />}
              {(reviewData || []).map((r) => (
                <div key={r.id} className="border border-base-700 bg-base-900/40 p-3 rounded-sm">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Pill map={DIMENSION_REVIEW_STATUS} status={r.status || 'pending'} />
                      <span className="font-mono text-xs text-steel-300">{r.reviewer || '—'}</span>
                    </div>
                    <span className="font-mono text-[11px] text-steel-400">{r.created_at || '—'}</span>
                  </div>
                  <div className="text-xs text-steel-300">{r.remark || '—'}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
