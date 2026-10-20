// Compatibilidad tras el movimiento a features/agenda/ (decisión D2 de BASE-03):
// re-export único, sin duplicar el panel. Los consumidores nuevos importan
// desde ../agenda; reversión = borrar features/agenda/ y restaurar el archivo.
export { default } from '../agenda/AgendaCalendarPage'
