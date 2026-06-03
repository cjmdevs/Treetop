import { api } from './client'

export const projectStatusesApi = {
  list:    (params = {}) => api.get(`/project-statuses?${new URLSearchParams(params)}`),
  create:  (data)        => api.post('/project-statuses', data),
  update:  (id, data)    => api.put(`/project-statuses/${id}`, data),
  reorder: (order)       => api.patch('/project-statuses/reorder', { order }),
  delete:  (id)          => api.delete(`/project-statuses/${id}`),
}
