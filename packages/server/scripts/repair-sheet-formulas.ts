import { prisma } from "../src/infra/database/db.js";
import { repairSheetFormulaContracts } from "../src/modules/sheets/application/repairSheetFormulaContracts.js";

try {
  const result = await repairSheetFormulaContracts();
  console.log(JSON.stringify(result));
} finally {
  await prisma.$disconnect();
}
