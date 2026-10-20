export function colombiaDay(value: string | number = Date.now()): string {
 return new Date(new Date(value).getTime() - 5 * 3600000).toISOString().slice(0, 10)
}
export function addDays(day: string, count: number): string {
 const date = new Date(`${day}T12:00:00Z`)
 date.setUTCDate(date.getUTCDate() + count)
 return date.toISOString().slice(0, 10)
}
export function monthDays(day: string): string[] {
 const first = `${day.slice(0, 7)}-01`
 const start = addDays(first, -new Date(`${first}T12:00:00Z`).getUTCDay())
 return Array.from({length:42}, (_,i) => addDays(start, i))
}
export function weekDays(day: string): string[] {
 const start = addDays(day, -new Date(`${day}T12:00:00Z`).getUTCDay())
 return Array.from({length:7}, (_,i) => addDays(start, i))
}
export function moveMonth(day: string, count: number): string {
 const date = new Date(`${day.slice(0,7)}-01T12:00:00Z`)
 date.setUTCMonth(date.getUTCMonth()+count)
 return date.toISOString().slice(0,10)
}

export function taskGroup(activity: {startsAt:string;status:string}, today:string): 'overdue'|'today'|'upcoming'|'completed' {
 if(activity.status==='COMPLETED')return 'completed'
 const day=colombiaDay(activity.startsAt)
 return day<today?'overdue':day===today?'today':'upcoming'
}
