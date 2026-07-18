CREATE TABLE "Chart" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "publicId" TEXT NOT NULL,
    "workbookId" INTEGER NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "spec" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Chart_workbookId_fkey" FOREIGN KEY ("workbookId") REFERENCES "Workbook" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Chart_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Chart_publicId_key" ON "Chart"("publicId");
CREATE INDEX "Chart_workbookId_order_idx" ON "Chart"("workbookId", "order");
CREATE INDEX "Chart_sheetId_idx" ON "Chart"("sheetId");
