-- FormulaCell is a derived index over canonical chunks; rebuild it with coordinates.
DROP TABLE "FormulaCell";

CREATE TABLE "FormulaCell" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sheetId" INTEGER NOT NULL,
    "row" INTEGER NOT NULL,
    "col" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "formula" TEXT NOT NULL,
    "ast" BLOB,
    "dependencies" BLOB,
    "cachedValue" BLOB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FormulaCell_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FormulaCell_sheetId_row_col_key" ON "FormulaCell"("sheetId", "row", "col");
CREATE UNIQUE INDEX "FormulaCell_sheetId_address_key" ON "FormulaCell"("sheetId", "address");
CREATE INDEX "FormulaCell_sheetId_row_col_idx" ON "FormulaCell"("sheetId", "row", "col");

CREATE TABLE "FormulaDependency" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sourceSheetId" INTEGER NOT NULL,
    "targetSheetId" INTEGER NOT NULL,
    "targetAddress" TEXT NOT NULL,
    "startRow" INTEGER NOT NULL,
    "startCol" INTEGER NOT NULL,
    "endRow" INTEGER NOT NULL,
    "endCol" INTEGER NOT NULL,
    CONSTRAINT "FormulaDependency_sourceSheetId_fkey" FOREIGN KEY ("sourceSheetId") REFERENCES "Sheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FormulaDependency_targetSheetId_fkey" FOREIGN KEY ("targetSheetId") REFERENCES "Sheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FormulaDependency_targetSheetId_targetAddress_sourceSheetId_startRow_startCol_endRow_endCol_key"
  ON "FormulaDependency"("targetSheetId", "targetAddress", "sourceSheetId", "startRow", "startCol", "endRow", "endCol");
CREATE INDEX "FormulaDependency_sourceSheetId_startRow_endRow_startCol_endCol_idx"
  ON "FormulaDependency"("sourceSheetId", "startRow", "endRow", "startCol", "endCol");
CREATE INDEX "FormulaDependency_targetSheetId_targetAddress_idx"
  ON "FormulaDependency"("targetSheetId", "targetAddress");
