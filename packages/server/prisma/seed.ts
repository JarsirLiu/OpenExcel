import { PrismaClient } from "@prisma/client";
import initData from "../../../templates/init.json" assert { type: "json" };

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.workbook.count();
  if (existing > 0) {
    console.log("Database already seeded, skipping.");
    return;
  }

  for (let wi = 0; wi < initData.workbooks.length; wi++) {
    const wb = initData.workbooks[wi];
    const workbook = await prisma.workbook.create({
      data: { name: wb.name, order: wi },
    });
    for (let si = 0; si < wb.sheets.length; si++) {
      const sh = wb.sheets[si];
      await prisma.sheet.create({
        data: {
          workbookId: workbook.id,
          name: sh.name,
          order: si,
          columns: JSON.stringify(sh.columns),
          merges: JSON.stringify(sh.merges ?? []),
          rows: JSON.stringify(sh.rows),
        },
      });
    }
    console.log(`Seeded workbook: ${wb.name} (${wb.sheets.length} sheets)`);
  }
  console.log("Seed complete.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
