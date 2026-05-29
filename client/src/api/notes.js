import { api } from './client'

export const notesApi = {
  list:   (filters = {}) => api.get(`/notes?${new URLSearchParams(filters)}`),
  create: (data)         => api.post('/notes', data),
  update: (id, data)     => api.patch(`/notes/${id}`, data),
  delete: (id)           => api.delete(`/notes/${id}`),
}
