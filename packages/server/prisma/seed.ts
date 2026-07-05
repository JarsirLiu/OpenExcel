import { PrismaClient } from "@prisma/client";
import initData from "../../../templates/init.json" assert { type: "json" };
import { gridToCelldata } from "@openexcel/core";

const prisma = new PrismaClient();

async function main() {
  const workspace = await prisma.workspace.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: "默认工作区",
      order: 0,
    },
  });

  const existing = await prisma.workbook.count();
  if (existing > 0) {
    console.log("Database already seeded, skipping workbook seed.");
  } else {
    for (let wi = 0; wi < initData.workbooks.length; wi++) {
      const wb = initData.workbooks[wi];
      const workbook = await prisma.workbook.create({
        data: { workspaceId: workspace.id, name: wb.name, order: wi },
      });
      for (let si = 0; si < wb.sheets.length; si++) {
        const sh = wb.sheets[si];
        const celldata = gridToCelldata(sh.rows, sh.columns.map((column) => column.label));
        await prisma.sheet.create({
          data: {
            workbookId: workbook.id,
            sheetNo: si + 1,
            name: sh.name,
            order: si,
            columns: JSON.stringify(sh.columns),
            merges: JSON.stringify(sh.merges ?? []),
            uploadedData: JSON.stringify(celldata),
          },
        });
      }
      console.log(`Seeded workbook: ${wb.name} (${wb.sheets.length} sheets)`);
    }
  }

  const existingSessions = await prisma.session.count({ where: { workspaceId: workspace.id } });
  if (existingSessions === 0) {
    await prisma.session.create({
      data: {
        workspaceId: workspace.id,
        sheetId: null,
        name: "新对话",
      },
    });
  }

  console.log("Seed complete.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
