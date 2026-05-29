import { api } from './client'

export const releasesApi = {
  list:    ()                       => api.get('/releases'),
  preview: (start_date, end_date)   => api.post('/releases/preview', { start_date, end_date }),
  create:  (start_date, end_date)   => api.post('/releases', { start_date, end_date }),
  delete:  (id)                     => api.delete(`/releases/${id}`),
}
