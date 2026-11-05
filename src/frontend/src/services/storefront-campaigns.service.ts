import api from './api'
import { normalizeCampaigns, type StorefrontCampaigns } from '../features/storefront/utils/campaigns'

/** Published banners and pop-up of the public storefront. */
export async function fetchStorefrontCampaigns(signal?: AbortSignal): Promise<StorefrontCampaigns> {
  const response = await api.get('/storefront/campaigns', { signal })
  return normalizeCampaigns(response.data)
}
