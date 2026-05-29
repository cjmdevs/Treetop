import { api } from './client'

export const subtasksApi = {
  list:   (engagementId)        => api.get(`/engagements/${engagementId}/subtasks`),
  create: (engagementId, data)  => api.post(`/engagements/${engagementId}/subtasks`, data),
  update: (engagementId, id, d) => api.patch(`/engagements/${engagementId}/subtasks/${id}`, d),
  delete: (engagementId, id)    => api.delete(`/engagements/${engagementId}/subtasks/${id}`),
}
