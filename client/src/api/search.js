import { api } from './client'

export const searchApi = {
  query: (q) => api.get(`/search?${new URLSearchParams({ q })}`),
}
