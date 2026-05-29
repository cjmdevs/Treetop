import { api } from './client'

export const billingApi = {
  list:    (f = {}) => api.get(`/billing?${new URLSearchParams(f)}`),
  summary: ()       => api.get('/billing/summary'),
  create:  (data)   => api.post('/billing', data),
  update:  (id, d)  => api.put(`/billing/${id}`, d),
  delete:  (id)     => api.delete(`/billing/${id}`),
}
