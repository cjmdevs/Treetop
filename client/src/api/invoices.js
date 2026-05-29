import { api } from './client'

export const invoicesApi = {
  list:     ()                        => api.get('/invoices'),
  get:      (id)                      => api.get(`/invoices/${id}`),
  generate: (billingRecordId, data)   => api.post(`/invoices/generate/${billingRecordId}`, data),
  delete:   (id)                      => api.delete(`/invoices/${id}`),
}
