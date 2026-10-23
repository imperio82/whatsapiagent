/** Puerto de hojas de cálculo en línea (Google Sheets hoy). Lo usa el módulo de importación. */
export interface SpreadsheetProvider {
  readonly provider: string;
  /** Nombres de las pestañas del documento. */
  listSheets(spreadsheetId: string): Promise<string[]>;
  /** Todas las filas de una pestaña, la primera son los encabezados. */
  readSheet(spreadsheetId: string, sheetName: string): Promise<string[][]>;
}
