import { Link } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAsync } from '../lib/useAsync.js'
import { useRole, ROLES } from '../lib/role.jsx'
import { StatCard, SectionTitle, Pill, Badge, Loading, EmptyState } from '../lib/ui.jsx'
import { VEHICLE_STATUS, MACHINE_STATUS, fmtNum, diffTone } from '../lib/format.js'

export default function Dashboard() {
  const { data: stats, loading: ls } = useAsync(api.stats, [])
  const { data: machines, loading: lm } = useAsync(api.machines, [])
  const { role } = useRole()
  const curRole = ROLES.find((r) => r.key === role)

  if (ls || lm || !stats) return <Loading text="载入控制台数据…" />

  const pv = stats.priorityVehicles || []

  return (
    <div className="space-y-6">
      <SectionTitle
        title="控制台总览"
        desc="车辆段轮对镟修排程 · 实时态势"
        right={<Badge tone="amber">当前角色 · {curRole?.label}</Badge>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="优先排程车辆" value={stats.vehicles.priority} unit="辆" tone="amber" sub="轮径差超阈值" />
        <StatCard label="待镟修" value={stats.vehicles.waiting} unit="辆" tone="steel" />
        <StatCard label="镟修中" value={stats.vehicles.maintaining} unit="辆" tone="sky" />
        <StatCard label="下线锁定" value={stats.vehicles.offline} unit="辆" tone="red" sub="质检未通过" />
        <StatCard label="可用机位" value={stats.machines.idle} unit="台" tone="green" />
        <StatCard label="作业中机位" value={stats.machines.busy} unit="台" tone="sky" />
        <StatCard label="保养中机位" value={stats.machines.maintenance} unit="台" tone="red" sub="禁止排车" />
        <StatCard label="待质检" value={stats.inspections.pending} unit="条" tone="violet" />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3 panel panel-accent p-4">
          <SectionTitle title="镟修机位态势" desc="机位状态与当前作业车辆" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(machines || []).map((m) => (
              <div key={m.id} className="relative border border-base-700 bg-base-900/60 p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="h-title text-sm text-steel-200">{m.machine_no}</div>
                    <div className="text-[11px] text-steel-400">{m.machine_name || '镟修机位'}</div>
                  </div>
                  <Pill map={MACHINE_STATUS} status={m.status} />
                </div>
                <div className="mt-3 border-t border-base-800 pt-2">
                  {m.current_vehicle_no ? (
                    <div className="text-xs">
                      <span className="text-steel-400">当前作业：</span>
                      <span className="font-mono text-amber-glow">{m.current_vehicle_no}</span>
                    </div>
                  ) : (
                    <div className="text-xs text-steel-400">
                      {m.maintenance_flag ? '保养维护中 · 禁止排车' : '空闲待命'}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 panel panel-accent p-4">
          <SectionTitle
            title="优先排程队列"
            desc="轮径差超阈值 · 按差值降序"
            right={<Badge tone="red">{pv.length} 辆</Badge>}
          />
          {pv.length === 0 ? (
            <EmptyState text="无优先排程车辆" />
          ) : (
            <div className="space-y-2">
              {pv.slice(0, 8).map((v, i) => {
                const tone = diffTone(v.wheel_diameter_diff)
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between border border-base-800 bg-base-900/50 px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[11px] text-amber">{String(i + 1).padStart(2, '0')}</span>
                      <span className="font-mono text-sm text-steel-200">{v.vehicle_no}</span>
                      <Pill map={VEHICLE_STATUS} status={v.status} />
                    </div>
                    <div className="text-right">
                      <div className={`stat-num text-sm ${tone.text}`}>{fmtNum(v.wheel_diameter_diff, 2)} mm</div>
                      <div className={`text-[10px] ${tone.text}`}>{tone.label}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="panel panel-accent p-4">
        <SectionTitle title="三方协同流程" desc="调度 → 检修 → 质检 联动闭环" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            {
              n: '01',
              role: '车辆段调度',
              act: '提交轮径数据',
              desc: '录入左右轮径，系统自动计算差值并标记优先级，超阈车辆进入待镟修队列。',
              link: '/vehicles',
              tone: 'amber',
            },
            {
              n: '02',
              role: '检修班',
              act: '安排镟修机位',
              desc: '选择空闲机位排程，开始镟修后机位置忙、车辆置镟修中，完成镟修后释放机位。',
              link: '/schedules',
              tone: 'sky',
            },
            {
              n: '03',
              role: '质检员',
              act: '确认修后尺寸',
              desc: '录入修后轮径并判定合格与否：合格则车辆上线，不合格则下线锁定，禁止上线。',
              link: '/inspections',
              tone: 'emerald',
            },
          ].map((s) => (
            <Link
              key={s.n}
              to={s.link}
              className="group relative border border-base-700 bg-base-900/60 p-4 transition-colors hover:border-amber/60"
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="font-mono text-xs text-amber">{s.n}</span>
                <span className="text-[11px] uppercase tracking-wider text-steel-400">{s.role}</span>
              </div>
              <div className="h-title text-base text-steel-200 group-hover:text-amber-glow">{s.act}</div>
              <p className="mt-1.5 text-xs leading-relaxed text-steel-400">{s.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
