import { api } from './client'

export const reportsApi = {
  run: (params) => api.get(`/reports?${new URLSearchParams(params)}`),
}
