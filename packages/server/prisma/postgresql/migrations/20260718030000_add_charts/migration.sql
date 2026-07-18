CREATE TABLE "Chart" (
    "id" SERIAL NOT NULL,
    "publicId" TEXT NOT NULL,
    "workbookId" INTEGER NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "spec" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chart_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Chart_publicId_key" ON "Chart"("publicId");
CREATE INDEX "Chart_workbookId_order_idx" ON "Chart"("workbookId", "order");
CREATE INDEX "Chart_sheetId_idx" ON "Chart"("sheetId");

ALTER TABLE "Chart" ADD CONSTRAINT "Chart_workbookId_fkey" FOREIGN KEY ("workbookId") REFERENCES "Workbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Chart" ADD CONSTRAINT "Chart_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
