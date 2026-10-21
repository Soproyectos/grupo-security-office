import { Modal } from '../../components/ui'
import PriceImportFlow from './PriceImportFlow'

/** Entry point of the single-template price import (replaces the legacy 9-step wizard button). */
export default function PriceImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Importar precios" size="full">
      {open && <PriceImportFlow />}
    </Modal>
  )
}
