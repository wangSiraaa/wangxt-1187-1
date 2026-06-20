const BASE = '/api'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    const msg = (data && data.error) || `请求失败 (${res.status})`
    const err = new Error(msg)
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

export const api = {
  health: () => request('/health'),
  stats: () => request('/stats'),

  vehicles: () => request('/vehicles'),
  vehicle: (id) => request(`/vehicles/${id}`),
  createVehicle: (body) => request('/vehicles', { method: 'POST', body }),
  updateVehicle: (id, body) => request(`/vehicles/${id}`, { method: 'PUT', body }),
  deleteVehicle: (id) => request(`/vehicles/${id}`, { method: 'DELETE' }),

  machines: () => request('/machines'),
  createMachine: (body) => request('/machines', { method: 'POST', body }),
  updateMachine: (id, body) => request(`/machines/${id}`, { method: 'PUT', body }),
  deleteMachine: (id) => request(`/machines/${id}`, { method: 'DELETE' }),

  schedules: () => request('/schedules'),
  createSchedule: (body) => request('/schedules', { method: 'POST', body }),
  updateSchedule: (id, body) => request(`/schedules/${id}`, { method: 'PUT', body }),
  deleteSchedule: (id) => request(`/schedules/${id}`, { method: 'DELETE' }),

  inspections: () => request('/inspections'),
  updateInspection: (id, body) => request(`/inspections/${id}`, { method: 'PUT', body }),

  sysparams: () => request('/sysparams'),
  updateSysparams: (body) => request('/sysparams', { method: 'PUT', body }),
}
