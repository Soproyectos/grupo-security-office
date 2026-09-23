import api from './api'

export interface AccessRequestPayload {
  companyName: string
  nit: string
  contactName: string
  email: string
  phone: string
  customerType: 'INSTALLER' | 'DISTRIBUTOR' | 'END_COMPANY'
  website?: string
}

export interface AccessRequestResponse {
  id: string
  companyName: string
  nit: string
  contactName: string
  email: string
  phone: string
  customerType: string
  status: string
  createdAt: string
}

export async function submitAccessRequest(
  payload: AccessRequestPayload
): Promise<AccessRequestResponse> {
  const response = await api.post('/public/access-requests', payload)
  return response.data
}
