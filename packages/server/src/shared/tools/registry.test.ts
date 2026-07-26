import { type ExcelToolName, excelToolSpecs } from "@openexcel/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createServerToolRegistry } from "./registry.js";
import { defineServerTool } from "./serverTool.js";

function manifestWithout(name: ExcelToolName) {
  return (Object.keys(excelToolSpecs) as ExcelToolName[])
    .filter((toolName) => toolName !== name)
    .map((toolName) =>
      defineServerTool(toolName, {
        contextSchema: z.unknown(),
        outputSchema: z.unknown(),
        execute: async () => ({}),
      }),
    );
}

describe("createServerToolRegistry", () => {
  it("rejects a server manifest that is missing a Core capability", () => {
    expect(() => createServerToolRegistry(manifestWithout("createChart"))).toThrow(
      "missing=createChart",
    );
  });

  it("rejects duplicate registrations", () => {
    const manifest = manifestWithout("createChart");
    const createChart = defineServerTool("createChart", {
      contextSchema: z.unknown(),
      outputSchema: z.unknown(),
      execute: async () => ({}),
    });

    expect(() => createServerToolRegistry([...manifest, createChart, createChart])).toThrow(
      "Duplicate server tool registration: createChart",
    );
  });

  it("rejects a server definition that replaces the Core input schema", () => {
    const manifest = manifestWithout("createChart");
    const createChart = defineServerTool("createChart", {
      contextSchema: z.unknown(),
      outputSchema: z.unknown(),
      execute: async () => ({}),
    });
    const mismatched = { ...createChart, inputSchema: z.object({ wrong: z.string() }) };

    expect(() => createServerToolRegistry([...manifest, mismatched])).toThrow(
      "Server tool contract mismatch: createChart",
    );
  });
});
