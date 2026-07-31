CREATE TABLE "SheetChunk" (
    "id" SERIAL NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "chunkRow" INTEGER NOT NULL,
    "chunkCol" INTEGER NOT NULL,
    "payload" TEXT NOT NULL,
    "contentRevision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SheetChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SheetChunk_sheetId_chunkRow_chunkCol_key" ON "SheetChunk"("sheetId", "chunkRow", "chunkCol");
CREATE INDEX "SheetChunk_sheetId_chunkRow_chunkCol_idx" ON "SheetChunk"("sheetId", "chunkRow", "chunkCol");
ALTER TABLE "SheetChunk" ADD CONSTRAINT "SheetChunk_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "SheetChunk" ("sheetId", "chunkRow", "chunkCol", "payload", "contentRevision", "updatedAt")
SELECT
    s."id",
    FLOOR((cell->>'r')::integer / 256)::integer,
    FLOOR((cell->>'c')::integer / 256)::integer,
    jsonb_build_object('celldata', jsonb_agg(cell))::text,
    s."revision",
    CURRENT_TIMESTAMP
FROM "Sheet" AS s
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s."uploadedData"::jsonb, '[]'::jsonb)) AS cell
GROUP BY
    s."id",
    FLOOR((cell->>'r')::integer / 256)::integer,
    FLOOR((cell->>'c')::integer / 256)::integer;
