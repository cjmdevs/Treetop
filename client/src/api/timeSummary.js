import { api } from './client'

export const timeSummaryApi = {
  mtd:        (staff)           => api.get(`/time-summary/mtd${staff ? `?staff=${encodeURIComponent(staff)}` : ''}`),
  period:     (periodId)        => api.get(`/time-summary/period/${periodId}`),
  myPeriod:   (periodId)        => api.get(`/time-summary/my-period/${periodId}`),
  alerts:     ()                => api.get('/time-summary/alerts'),
  dailyHours: (staff, from, to) =>
    api.get(`/time-summary/daily-hours?staff=${encodeURIComponent(staff)}&from=${from}&to=${to}`),
}
