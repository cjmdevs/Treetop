import { api } from './client'

export const templatesApi = {
  list:   ()         => api.get('/templates'),
  get:    (id)       => api.get(`/templates/${id}`),
  create: (data)     => api.post('/templates', data),
  update: (id, data) => api.put(`/templates/${id}`, data),
  delete: (id)       => api.delete(`/templates/${id}`),
}
