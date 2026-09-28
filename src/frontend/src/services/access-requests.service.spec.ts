import { describe, it, expect, vi } from 'vitest'

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return {
    ...actual,
    default: { post: vi.fn(), get: vi.fn() },
  }
})

import api from './api'
import { submitAccessRequest, type AccessRequestPayload } from './access-requests.service'

describe('submitAccessRequest', () => {
  const payload: AccessRequestPayload = {
    companyName: 'Acme Corp',
    nit: '1234567890',
    contactName: 'John Doe',
    email: 'john@acme.com',
    phone: '+57 301 555 0123',
    customerType: 'INSTALLER',
  }

  it('resolves to the inner { received } shape once the api interceptor unwraps response.data', async () => {
    // The api instance's response interceptor already unwraps the backend's
    // { data: ... } envelope, so the mocked axios call resolves with the
    // inner payload directly on `response.data`.
    vi.mocked(api.post).mockResolvedValueOnce({ data: { received: true } })

    const result = await submitAccessRequest(payload)

    expect(result).toEqual({ received: true })
  })

  it('posts to the correct URL with the given payload', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { received: true } })

    await submitAccessRequest(payload)

    expect(api.post).toHaveBeenCalledWith('/public/access-requests', payload)
  })
})
