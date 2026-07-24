import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/features/chat/composer/SheetMentionList.tsx"),
  "utf8",
);
const styles = readFileSync(
  resolve(process.cwd(), "src/features/chat/composer/SheetMentionList.module.css"),
  "utf8",
);

describe("Sheet mention popup layering", () => {
  it("keeps the body-mounted suggestion above sheet overlays", () => {
    expect(source).toContain("component.element.classList.add(styles.popup)");
    expect(styles).toContain("z-index: 200");
  });
});
