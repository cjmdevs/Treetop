import { api } from './client'

export const inviteKeysApi = {
  list:     ()         => api.get('/invite-keys'),
  generate: (data)     => api.post('/invite-keys', data),
  revoke:   (id)       => api.post(`/invite-keys/${id}/revoke`, {}),
}
