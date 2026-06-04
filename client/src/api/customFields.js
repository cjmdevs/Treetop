import { api } from './client'

export const customFieldsApi = {
  listDefinitions:  ()             => api.get('/custom-fields/definitions'),
  createDefinition: (data)         => api.post('/custom-fields/definitions', data),
  updateDefinition: (id, data)     => api.put(`/custom-fields/definitions/${id}`, data),
  deleteDefinition: (id)           => api.delete(`/custom-fields/definitions/${id}`),
  getValues:        (engagementId) => api.get(`/custom-fields/values/${engagementId}`),
  setValue:         (engagementId, data) => api.post(`/custom-fields/values/${engagementId}`, data),
  // Contact-scoped
  listContactFields:   ()           => api.get('/custom-fields/contact-fields'),
  getContactValues:    (contactId)  => api.get(`/custom-fields/contact-values/${contactId}`),
  setContactValue:     (contactId, data) => api.post(`/custom-fields/contact-values/${contactId}`, data),
}
