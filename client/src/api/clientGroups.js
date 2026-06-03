import { api } from './client'

export const clientGroupsApi = {
  list:          ()             => api.get('/client-groups'),
  create:        (data)         => api.post('/client-groups', data),
  update:        (id, data)     => api.put(`/client-groups/${id}`, data),
  delete:        (id)           => api.delete(`/client-groups/${id}`),
  getMembers:    (id)           => api.get(`/client-groups/${id}/members`),
  addMember:     (id, contact_id) => api.post(`/client-groups/${id}/members`, { contact_id }),
  removeMember:  (id, contactId) => api.delete(`/client-groups/${id}/members/${contactId}`),
}
