/** Options the save bar passes to the sheet save. */
export interface SheetSaveOptions {
  /** Product name saved in this run. The sheet name takes it; the sheet has no name field of its own in the editor. */
  syncName?: string
  /** Save the sheet even when it has no unsaved edits. */
  force?: boolean
}

export interface EditorSaveSteps {
  datosDirty: boolean
  sheetDirty: boolean
  /** Product name saved in this run, only when it changed. */
  syncName?: string
  /** Saves the general data. Resolves true when saved. */
  saveDatos: () => Promise<boolean>
  /** Validates and saves the sheet. Resolves true when saved. */
  saveSheet: (options: SheetSaveOptions) => Promise<boolean>
}

/**
 * One save for the whole editor: general data first, then the sheet.
 * If the data fails, it stops there and the sheet is not touched. Resolves true only when every dirty part was saved.
 * A changed product name always saves the sheet, so the store shows the new name even when the sheet had no edits.
 */
export async function saveEditorParts({ datosDirty, sheetDirty, syncName, saveDatos, saveSheet }: EditorSaveSteps): Promise<boolean> {
  if (datosDirty && !(await saveDatos())) return false
  const nameChanged = syncName !== undefined
  if (!sheetDirty && !nameChanged) return true
  return saveSheet({ syncName, force: nameChanged })
}
