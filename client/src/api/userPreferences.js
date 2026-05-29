import { api } from './client'

export const prefsApi = {
  get: (key) => api.get(`/user-preferences/${encodeURIComponent(key)}`),
  set: (key, value) => api.put(`/user-preferences/${encodeURIComponent(key)}`, { value }),
}
