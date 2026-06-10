import { api } from './client'

export const passwordResetKeysApi = {
  redeem: (data) => api.post('/auth/redeem-reset', data),
}
