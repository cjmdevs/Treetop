import { api } from './client'

export const engagementsApi = {
  list:   (f = {}) => api.get(`/engagements?${new URLSearchParams(f)}`),
  get:    (id)     => api.get(`/engagements/${id}`),
  create: (data)   => api.post('/engagements', data),
  update: (id, d)  => api.put(`/engagements/${id}`, d),
  delete: (id)     => api.delete(`/engagements/${id}`),
  bulk:   (data)   => api.patch('/engagements/bulk', data),
}
