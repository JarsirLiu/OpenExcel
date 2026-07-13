export function rendererRowToDocumentRow(renderRow: number, headerRows: number): number {
  return renderRow - headerRows;
}

export function documentRowToRendererRow(documentRow: number, headerRows: number): number {
  return documentRow + headerRows;
}

export function isRendererHeaderRow(renderRow: number, headerRows: number): boolean {
  return renderRow < headerRows;
}
