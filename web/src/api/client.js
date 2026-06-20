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
  setVehicleEmergency: (id, body) => request(`/vehicles/${id}/emergency`, { method: 'POST', body }),

  machines: () => request('/machines'),
  createMachine: (body) => request('/machines', { method: 'POST', body }),
  updateMachine: (id, body) => request(`/machines/${id}`, { method: 'PUT', body }),
  deleteMachine: (id) => request(`/machines/${id}`, { method: 'DELETE' }),
  machineSlots: (id) => request(`/machines/${id}/available-slots`),

  schedules: () => request('/schedules'),
  schedule: (id) => request(`/schedules/${id}`),
  createSchedule: (body) => request('/schedules', { method: 'POST', body }),
  updateSchedule: (id, body) => request(`/schedules/${id}`, { method: 'PUT', body }),
  deleteSchedule: (id) => request(`/schedules/${id}`, { method: 'DELETE' }),
  scheduleHistory: (id) => request(`/schedules/${id}/history`),
  jumpQueue: (id, body) => request(`/schedules/${id}/jump-queue`, { method: 'POST', body }),
  maintenanceReview: (body) => request('/schedules/maintenance-review', { method: 'POST', body }),
  reworkTasks: () => request('/schedules/rework/tasks'),
  resolveReworkTask: (id, body) => request(`/schedules/rework/tasks/${id}/resolve`, { method: 'POST', body }),

  inspections: () => request('/inspections'),
  inspection: (id) => request(`/inspections/${id}`),
  createInspection: (body) => request('/inspections', { method: 'POST', body }),
  updateInspection: (id, body) => request(`/inspections/${id}`, { method: 'PUT', body }),
  inspectionReviews: (id) => request(`/inspections/${id}/reviews`),
  createDimensionReview: (id, body) => request(`/inspections/${id}/review`, { method: 'POST', body }),

  sysparams: () => request('/sysparams'),
  updateSysparams: (body) => request('/sysparams', { method: 'PUT', body }),
}
