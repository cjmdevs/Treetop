import { api } from './client'

export const contactClientTypesApi = {
  list:   (params = {}) => api.get(`/contact-client-types?${new URLSearchParams(params)}`),
  create: (data)        => api.post('/contact-client-types', data),
  update: (id, data)    => api.put(`/contact-client-types/${id}`, data),
  delete: (id)          => api.delete(`/contact-client-types/${id}`),
}
