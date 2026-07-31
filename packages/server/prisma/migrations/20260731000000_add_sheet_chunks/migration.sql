CREATE TABLE "SheetChunk" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sheetId" INTEGER NOT NULL,
    "chunkRow" INTEGER NOT NULL,
    "chunkCol" INTEGER NOT NULL,
    "payload" TEXT NOT NULL,
    "contentRevision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SheetChunk_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SheetChunk_sheetId_chunkRow_chunkCol_key" ON "SheetChunk"("sheetId", "chunkRow", "chunkCol");
CREATE INDEX "SheetChunk_sheetId_chunkRow_chunkCol_idx" ON "SheetChunk"("sheetId", "chunkRow", "chunkCol");

INSERT INTO "SheetChunk" ("sheetId", "chunkRow", "chunkCol", "payload", "contentRevision", "updatedAt")
SELECT
    s."id",
    CAST(json_extract(cell.value, '$.r') / 256 AS INTEGER),
    CAST(json_extract(cell.value, '$.c') / 256 AS INTEGER),
    json_object('celldata', json_group_array(json(cell.value))),
    s."revision",
    CURRENT_TIMESTAMP
FROM "Sheet" AS s
CROSS JOIN json_each(COALESCE(s."uploadedData", '[]')) AS cell
GROUP BY
    s."id",
    CAST(json_extract(cell.value, '$.r') / 256 AS INTEGER),
    CAST(json_extract(cell.value, '$.c') / 256 AS INTEGER);
