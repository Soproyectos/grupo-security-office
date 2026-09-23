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

// Matches AccessRequestsService.createPublic's actual resolved shape on the
// backend (api.ts's response interceptor already unwraps the `{ data: ... }`
// envelope, so callers only ever see this inner shape).
export interface AccessRequestResponse {
  received: boolean
}

export async function submitAccessRequest(
  payload: AccessRequestPayload
): Promise<AccessRequestResponse> {
  const response = await api.post('/public/access-requests', payload)
  return response.data
}
