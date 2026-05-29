import { api } from './client'

export const timeEntriesApi = {
  list:      (f = {})   => api.get(`/time-entries?${new URLSearchParams(f)}`),
  create:    (data)     => api.post('/time-entries', data),
  update:    (id, data) => api.put(`/time-entries/${id}`, data),
  delete:    (id)       => api.delete(`/time-entries/${id}`),
  bulk:      (data)     => api.patch('/time-entries/bulk', data),
  setStatus: (id, status) => api.patch(`/time-entries/${id}/status`, { status }),
}
