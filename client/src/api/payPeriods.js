import { api } from './client'

export const payPeriodsApi = {
  list:            (year)                    => api.get(`/pay-periods${year ? `?year=${year}` : ''}`),
  current:         ()                        => api.get('/pay-periods/current'),
  get:             (id)                      => api.get(`/pay-periods/${id}`),
  generate:        (year)                    => api.post('/pay-periods/generate', { year }),
  setStatus:       (id, status, released_by) => api.patch(`/pay-periods/${id}/status`, { status, released_by }),
  submit:          (id, staff_member)        => api.post(`/pay-periods/${id}/submit`, { staff_member }),
  release:         (id, staff_member, released_by) =>
    api.post(`/pay-periods/${id}/release`, { staff_member, released_by }),
  // Per-user release (from Part 1)
  getMyStatus:     (id)         => api.get(`/pay-periods/${id}/my-status`),
  releaseMyTime:   (id)         => api.post(`/pay-periods/${id}/release-my-time`, {}),
  getAllStatuses:   (id)         => api.get(`/pay-periods/${id}/all-user-statuses`),
  unreleaseUser:   (id, userId) => api.post(`/pay-periods/${id}/unrelease-user/${userId}`, {}),
  // Admin endpoints (Part 2)
  mySummary:       ()              => api.get('/pay-periods/my-summary'),
  staffSummary:    (id)            => api.get(`/pay-periods/${id}/staff-summary`),
  releaseUser:     (id, userId)    => api.post(`/pay-periods/${id}/release-user/${userId}`, {}),
  bulkRelease:     (id)            => api.post(`/pay-periods/${id}/bulk-release`, {}),
}
