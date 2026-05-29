import { api } from './client'

export const paymentsApi = {
  list:   ()     => api.get('/payments'),
  aging:  ()     => api.get('/payments/aging'),
  create: (data) => api.post('/payments', data),
  delete: (id)   => api.delete(`/payments/${id}`),
}
