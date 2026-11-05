import type { ChangeEvent } from 'react'
import type { AgendaPerson } from '../../services/agenda.service'

/**
 * Selector «Asignar a» del formulario de creación (BASE-03 frontend-equipo).
 *
 * Solo se renderiza para quien puede asignar a otros: un usuario sin equipo
 * crea siempre para sí mismo, así que el campo de asignado ajeno no aparece
 * (aceptación «Solo Agenda propia no muestra equipo»). Lista a todas las
 * personas activas del equipo que devuelve el servidor, sin filtrar por cargo.
 */

const inputStyle = 'mt-1 w-full rounded-lg border border-neutral-300 p-2 text-sm'

export default function AgendaAssigneeField({
  canAssign,
  people,
  value,
  onChange,
}: {
  canAssign: boolean
  people?: AgendaPerson[]
  value: string
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void
}) {
  if (!canAssign) return null
  return (
    <label className="block text-sm">
      Asignar a
      <select required className={inputStyle} value={value} onChange={onChange}>
        <option value="">Selecciona una persona</option>
        {people?.map(person => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
      </select>
    </label>
  )
}
