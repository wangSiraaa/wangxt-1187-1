import { createContext, useContext, useEffect, useState } from 'react'

export const ROLES = [
  { key: 'dispatcher', label: '车辆段调度', short: '调度', accent: 'amber' },
  { key: 'mechanic', label: '检修班', short: '检修', accent: 'sky' },
  { key: 'inspector', label: '质检员', short: '质检', accent: 'emerald' },
  { key: 'admin', label: '调度长', short: '管理', accent: 'violet' },
]

const PERMISSIONS = {
  manageVehicles: ['dispatcher', 'admin'],
  manageMachines: ['mechanic', 'admin'],
  manageSchedules: ['mechanic', 'admin'],
  manageInspections: ['inspector', 'admin'],
  manageSettings: ['admin'],
}

const RoleContext = createContext({ role: 'admin', setRole: () => {}, can: () => true })

export function RoleProvider({ children }) {
  const [role, setRoleState] = useState(() => localStorage.getItem('wl_role') || 'dispatcher')

  useEffect(() => {
    localStorage.setItem('wl_role', role)
  }, [role])

  const setRole = (k) => setRoleState(k)
  const can = (action) => (PERMISSIONS[action] || []).includes(role)

  return (
    <RoleContext.Provider value={{ role, setRole, can }}>{children}</RoleContext.Provider>
  )
}

export function useRole() {
  return useContext(RoleContext)
}
