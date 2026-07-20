import { defaultDemoPlayback } from "./replayPlayback";
import type { DemoDefinition, DemoPatch, DemoStep } from "./replayTypes";

const playbackSettingNames = new Set(Object.keys(defaultDemoPlayback));

function patchesOf(step: DemoStep): DemoPatch[] {
  if (!step.patch) return [];
  return Array.isArray(step.patch) ? step.patch : [step.patch];
}

export function validateDemoDefinition(definition: DemoDefinition): string[] {
  const errors: string[] = [];
  const workbookNames = new Set(definition.initialWorkbooks.map((workbook) => workbook.name));
  const stepIds = new Set<string>();

  for (const [name, value] of Object.entries(definition.playback ?? {})) {
    if (!playbackSettingNames.has(name)) {
      errors.push(`unknown playback setting: ${name}`);
    } else if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      errors.push(`invalid playback setting: ${name}`);
    }
  }

  for (const step of definition.timeline) {
    if (stepIds.has(step.id)) errors.push(`duplicate step id: ${step.id}`);
    stepIds.add(step.id);

    if (step.activeWorkbook && !workbookNames.has(step.activeWorkbook)) {
      errors.push(`unknown workbook in step ${step.id}: ${step.activeWorkbook}`);
      continue;
    }

    const workbook = definition.initialWorkbooks.find(
      (candidate) => candidate.name === step.activeWorkbook,
    );
    if (
      step.activeSheet &&
      workbook &&
      !workbook.sheets.some((sheet) => sheet.name === step.activeSheet)
    ) {
      errors.push(`unknown sheet in step ${step.id}: ${step.activeSheet}`);
    }

    for (const patch of patchesOf(step)) {
      const workbookName = patch.workbook ?? step.activeWorkbook;
      const target = definition.initialWorkbooks.find(
        (candidate) => candidate.name === workbookName,
      );
      if (!target) {
        errors.push(`unknown patch workbook in step ${step.id}: ${workbookName}`);
        continue;
      }
      const sheet = target.sheets.find((candidate) => candidate.name === patch.sheet);
      if (!sheet) {
        errors.push(`unknown patch sheet in step ${step.id}: ${patch.sheet}`);
        continue;
      }
      if (
        patch.row < 1 ||
        patch.row > sheet.rows.length ||
        patch.startCol < 1 ||
        patch.startCol + patch.values.length - 1 > sheet.columns.length
      ) {
        errors.push(`patch out of bounds in step ${step.id}`);
      }
    }
  }

  return errors;
}
