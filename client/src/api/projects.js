import { api } from './client'

export const projectsApi = {
  list: (params = {}) => {
    const clean = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    )
    const qs = new URLSearchParams(clean).toString()
    return api.get(`/projects${qs ? `?${qs}` : ''}`)
  },

  get: (id) => api.get(`/projects/${id}`),

  byClient: (clientName) =>
    api.get(`/projects/by-client/${encodeURIComponent(clientName)}`),

  create: (data) => api.post('/projects', data),

  update: (id, data) => api.put(`/projects/${id}`, data),

  setStatus: (id, status) => api.patch(`/projects/${id}/status`, { status }),

  rollForward: (id) => api.post(`/projects/${id}/roll-forward`, {}),

  rollForwardBatch: (ids) => api.post('/projects/roll-forward-batch', { ids }),
}
