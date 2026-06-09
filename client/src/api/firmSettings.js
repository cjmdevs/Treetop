import { api } from './client'

export const firmSettingsApi = {
  get:    ()     => api.get('/firm-settings'),
  update: (data) => api.put('/firm-settings', data),
}
