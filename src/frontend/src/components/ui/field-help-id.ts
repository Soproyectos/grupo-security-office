/** Id of the help text of a field; link it with `aria-describedby={helpId(id)}` on the control. */
export function helpId(fieldId: string): string {
  return `${fieldId}-help`
}
