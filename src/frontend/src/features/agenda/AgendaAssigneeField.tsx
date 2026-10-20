import type { ChangeEvent } from 'react'
import type { AgendaPerson } from '../../services/agenda.service'

/**
 * Selector «Vendedor» del formulario de creación (BASE-03 frontend-equipo).
 *
 * Solo se renderiza para quien puede asignar a otros: un usuario sin equipo
 * crea siempre para sí mismo, así que el campo de asignado ajeno no aparece
 * (aceptación «Solo Agenda propia no muestra equipo»). El control se oculta
 * también si no hay directorio: sin vendedores no podría llamar a la API
 * (PANELES-Y-PERMISOS:27).
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
      Vendedor
      <select required className={inputStyle} value={value} onChange={onChange}>
        <option value="">Selecciona un vendedor</option>
        {people?.map(person => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
      </select>
    </label>
  )
}
