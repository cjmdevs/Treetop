import { api } from './client'

export const contactsApi = {
  list:              (f = {})           => api.get(`/contacts?${new URLSearchParams(f)}`),
  get:               (id)               => api.get(`/contacts/${id}`),
  create:            (data)             => api.post('/contacts', data),
  update:            (id, data)         => api.put(`/contacts/${id}`, data),
  delete:            (id)               => api.delete(`/contacts/${id}`),
  revealSensitive:   (id)               => api.get(`/contacts/${id}/reveal-sensitive`),
  logActivity:       (id, data)         => api.post(`/contacts/${id}/activity`, data),
  addAffiliate:      (id, data)         => api.post(`/contacts/${id}/affiliates`, data),
  removeAffiliate:   (id, relId)        => api.delete(`/contacts/${id}/affiliates/${relId}`),
  addTag:            (id, tag)          => api.post(`/contacts/${id}/tags`, { tag }),
  removeTag:         (id, tag)          => api.delete(`/contacts/${id}/tags/${encodeURIComponent(tag)}`),
  setAssignments:    (id, assignments)  => api.put(`/contacts/${id}/staff-assignments`, { assignments }),
  metaTags:          ()                 => api.get('/contacts/meta/tags'),
  metaClientTypes:   ()                 => api.get('/contacts/meta/client-types'),
}
