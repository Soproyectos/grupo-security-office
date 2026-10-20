import api from '../../services/api'
import type { MoneyAmount } from '../../services/dashboard.service'

export interface PersonalSalesGoal {
  period: string
  target: MoneyAmount | null
  invoiced: MoneyAmount & { mixedCurrency: boolean }
  remaining: MoneyAmount | null
  progressPercent: number | null
}

export async function fetchPersonalSalesGoal(): Promise<PersonalSalesGoal> {
  const response = await api.get('/dashboard/sales-goal')
  return response.data as PersonalSalesGoal
}
