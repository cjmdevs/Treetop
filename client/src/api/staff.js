import { api } from './client'

export const staffApi = {
  list:      ()     => api.get('/staff'),
  dashboard: ()     => api.get('/staff/dashboard'),
  detail:    (name) => api.get(`/staff/detail/${encodeURIComponent(name)}`),
}
