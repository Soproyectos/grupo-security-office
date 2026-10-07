import { describe, expect, it } from 'vitest'
import { colombiaDay, monthDays, moveMonth, taskGroup, weekDays } from './calendar-dates'
describe('Colombia calendar boundaries',()=>{
 it('keeps early UTC hours on the previous Colombia day',()=>expect(colombiaDay('2026-10-07T03:00:00Z')).toBe('2026-10-06'))
 it('builds complete Sunday-to-Saturday weeks across month boundaries',()=>expect(weekDays('2026-10-01')).toEqual(['2026-09-27','2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02','2026-10-03']))
 it('includes leap day and all adjacent cells in the month grid',()=>{const days=monthDays('2028-02-10');expect(days).toHaveLength(42);expect(days).toContain('2028-02-29');expect(new Set(days).size).toBe(42)})
 it('moves from a month end without skipping February',()=>expect(moveMonth('2026-01-31',1)).toBe('2026-02-01'))
 it('crosses the year boundary',()=>expect(moveMonth('2026-12-31',1)).toBe('2027-01-01'))
})

describe('Shared calendar task classification',()=>{
 it('groups an early UTC activity into the previous Colombia day',()=>expect(taskGroup({startsAt:'2026-10-07T03:00:00Z',status:'PENDING'},'2026-10-07')).toBe('overdue'))
 it('keeps completed activities out of overdue tasks',()=>expect(taskGroup({startsAt:'2026-10-01T15:00:00Z',status:'COMPLETED'},'2026-10-07')).toBe('completed'))
 it('distinguishes today from upcoming activities',()=>{
  expect(taskGroup({startsAt:'2026-10-07T15:00:00Z',status:'PENDING'},'2026-10-07')).toBe('today')
  expect(taskGroup({startsAt:'2026-10-08T15:00:00Z',status:'PENDING'},'2026-10-07')).toBe('upcoming')
 })
})
