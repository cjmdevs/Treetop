import { api } from './client'

export const dashboardApi = {
  stats: () => api.get('/dashboard'),
}
