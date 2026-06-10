import { api } from './client'

export const dueDatesApi = {
  taxDeadlines: ()        => api.get('/due-dates/tax-deadlines'),
  upcoming:     (days)    => api.get(`/due-dates/upcoming${days ? `?days=${days}` : ''}`),
}
