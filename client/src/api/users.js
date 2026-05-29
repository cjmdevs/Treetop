import { api } from './client'

export const usersApi = {
  list:   ()         => api.get('/users'),
  create: (data)     => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  toggle: (id)       => api.patch(`/users/${id}/toggle`, {}),
}
