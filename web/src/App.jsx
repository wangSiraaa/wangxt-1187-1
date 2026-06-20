import { useEffect, useState } from 'react'
import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { api } from './api/client.js'
import { useRole, ROLES } from './lib/role.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Vehicles from './pages/Vehicles.jsx'
import Machines from './pages/Machines.jsx'
import Schedules from './pages/Schedules.jsx'
import Inspections from './pages/Inspections.jsx'
import Settings from './pages/Settings.jsx'

const NAV = [
  { to: '/', label: '控制台', code: 'CTRL', end: true },
  { to: '/vehicles', label: '车辆档案', code: 'VEH' },
  { to: '/machines', label: '镟修机位', code: 'MAC' },
  { to: '/schedules', label: '排程作业', code: 'SCH' },
  { to: '/inspections', label: '质检确认', code: 'QC' },
  { to: '/settings', label: '系统参数', code: 'SYS' },
]

function Sidebar() {
  const { role, setRole } = useRole()
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-base-700 bg-base-900/70 backdrop-blur">
      <div className="flex items-center gap-3 border-b border-base-700 px-5 py-4">
        <div className="relative flex h-9 w-9 items-center justify-center border border-amber/60 bg-amber/10">
          <span className="h-2 w-2 rounded-full bg-amber animate-pulseDot" />
          <span className="absolute -inset-px border border-amber/20" />
        </div>
        <div>
          <div className="h-title text-sm leading-tight text-steel-200">轮对镟修</div>
          <div className="h-title text-[11px] tracking-[0.2em] text-amber/80">排程系统 · DEPOT</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'text-amber-glow bg-amber/5'
                  : 'text-steel-300 hover:bg-base-800/60 hover:text-steel-200'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`font-mono text-[10px] tracking-wider ${
                    isActive ? 'text-amber' : 'text-steel-400'
                  }`}
                >
                  {item.code}
                </span>
                <span className="font-medium">{item.label}</span>
                {isActive && <span className="absolute left-0 top-0 h-full w-[3px] bg-amber" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-base-700 p-3">
        <div className="mb-2 px-1 text-[10px] uppercase tracking-wider text-steel-400">当前角色</div>
        <div className="grid grid-cols-2 gap-1.5">
          {ROLES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRole(r.key)}
              className={`border px-2 py-1.5 text-xs transition-colors ${
                role === r.key
                  ? 'border-amber/70 bg-amber/15 text-amber-glow'
                  : 'border-base-700 bg-base-850 text-steel-300 hover:border-base-600'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}

function TopBar() {
  const [time, setTime] = useState(new Date())
  const [healthy, setHealthy] = useState(true)
  const { role } = useRole()
  const location = useLocation()
  const current = NAV.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to) && n.to !== '/'))

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    let active = true
    const ping = () => api.health().then(() => active && setHealthy(true)).catch(() => active && setHealthy(false))
    ping()
    const h = setInterval(ping, 15000)
    return () => { active = false; clearInterval(h) }
  }, [])

  const pad = (n) => String(n).padStart(2, '0')
  const clock = `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`

  return (
    <header className="flex items-center justify-between border-b border-base-700 bg-base-900/50 px-6 py-3 backdrop-blur">
      <div className="flex items-center gap-3">
        <span className="font-mono text-[11px] tracking-widest text-steel-400">
          {current?.code || 'CTRL'} ·
        </span>
        <h1 className="h-title text-base text-steel-200">{current?.label || '控制台'}</h1>
      </div>
      <div className="flex items-center gap-5">
        <div className="flex items-center gap-2 font-mono text-xs">
          <span
            className={`h-2 w-2 rounded-full ${healthy ? 'bg-signal-online animate-pulseDot' : 'bg-signal-offline'}`}
          />
          <span className={healthy ? 'text-signal-online' : 'text-signal-offline'}>
            {healthy ? 'API 在线' : 'API 离线'}
          </span>
        </div>
        <div className="font-mono text-sm text-amber-glow tabular-nums">{clock}</div>
        <div className="font-mono text-[11px] text-steel-400">DEPOT-01 / 班次 A</div>
      </div>
    </header>
  )
}

export default function App() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/vehicles" element={<Vehicles />} />
            <Route path="/machines" element={<Machines />} />
            <Route path="/schedules" element={<Schedules />} />
            <Route path="/inspections" element={<Inspections />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
