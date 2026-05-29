import { api } from './client'

export const serviceCodesApi = {
  list:    ()         => api.get('/service-codes'),
  listAll: ()         => api.get('/service-codes?include_inactive=true'),
  create:  (data)     => api.post('/service-codes', data),
  update:  (id, data) => api.put(`/service-codes/${id}`, data),
  toggle:  (id)       => api.patch(`/service-codes/${id}/toggle`),
  delete:  (id)       => api.delete(`/service-codes/${id}`),
}
