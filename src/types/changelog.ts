export type ChangeLogAction =
  | 'cell_edit'
  | 'formula_update'
  | 'label_rename'
  | 'remarks_change'
  | 'item_add'
  | 'item_remove'
  | 'sheet_create'
  | 'sheet_rename'
  | 'sheet_duplicate'
  | 'sheet_delete';

export interface ChangeLogEntry {
  id: string;
  timestamp: string;
  formattedDate: string;
  sheetName: string;
  year?: number;
  action: ChangeLogAction;
  actionLabel: string;
  rowLabel?: string;
  column?: string;
  oldValue?: string;
  newValue?: string;
  description: string;
}
