import { api } from './client'

export const activityApi = {
  list: (filters = {}) => api.get(`/activity?${new URLSearchParams(filters)}`),
}
