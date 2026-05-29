import { api } from './client'

export const staffRatesApi = {
  list:    (staff_member) =>
    api.get(`/staff-rates${staff_member ? `?staff_member=${encodeURIComponent(staff_member)}` : ''}`),
  current: ()       => api.get('/staff-rates/current'),
  create:  (data)   => api.post('/staff-rates', data),
  delete:  (id)     => api.delete(`/staff-rates/${id}`),
}
