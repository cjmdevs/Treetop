import { api } from './client'

export const automationsApi = {
  list:   ()         => api.get('/automations'),
  create: (data)     => api.post('/automations', data),
  update: (id, data) => api.put(`/automations/${id}`, data),
  toggle: (id)       => api.patch(`/automations/${id}/toggle`, {}),
  delete: (id)       => api.delete(`/automations/${id}`),
}
