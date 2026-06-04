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

  rollForward: (id, body = {}) => api.post(`/projects/${id}/roll-forward`, body),

  rollForwardBatch: (ids) => api.post('/projects/roll-forward-batch', { ids }),

  getMilestones:   (id)          => api.get(`/projects/${id}/milestones`),
  saveMilestone:   (id, fid, val)=> api.post(`/projects/${id}/milestones`, { field_definition_id: fid, value: val }),
  checkGroup:      (name)        => api.get(`/projects/check-group?client_name=${encodeURIComponent(name)}`),
  milestoneFields: ()            => api.get('/projects/meta/milestone-fields'),
}
