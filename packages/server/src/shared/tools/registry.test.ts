import { type ExcelToolName, excelToolSpecs } from "@openexcel/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createServerToolRegistry } from "./registry.js";
import { defineServerTool, type ServerToolRuntimeDefinition } from "./serverTool.js";

function manifestWithout(name: ExcelToolName): readonly ServerToolRuntimeDefinition[] {
  return (Object.keys(excelToolSpecs) as ExcelToolName[])
    .filter((toolName) => toolName !== name)
    .map((toolName) =>
      defineServerTool(toolName, {
        execute: async () => undefined as never,
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
      execute: async () => undefined as never,
    });

    expect(() => createServerToolRegistry([...manifest, createChart, createChart])).toThrow(
      "Duplicate server tool registration: createChart",
    );
  });

  it("rejects a server definition that replaces the Core input schema", () => {
    const manifest = manifestWithout("createChart");
    const createChart = defineServerTool("createChart", {
      execute: async () => undefined as never,
    });
    const mismatched = { ...createChart, inputSchema: z.object({ wrong: z.string() }) };

    expect(() => createServerToolRegistry([...manifest, mismatched])).toThrow(
      "Server tool contract mismatch: createChart",
    );
  });

  it("rejects a server definition that replaces the Core output schema", () => {
    const manifest = manifestWithout("createChart");
    const createChart = defineServerTool("createChart", {
      execute: async () => undefined as never,
    });
    const mismatched = { ...createChart, outputSchema: z.any() };

    expect(() => createServerToolRegistry([...manifest, mismatched])).toThrow(
      "Server tool contract mismatch: createChart",
    );
  });

  it("rejects a server definition with the wrong context contract", () => {
    const manifest = manifestWithout("createChart");
    const createChart = defineServerTool("createChart", {
      execute: async () => undefined as never,
    });
    const mismatched = {
      ...createChart,
      contextScope: "workspace" as const,
      contextSchema: z.any(),
    };

    expect(() => createServerToolRegistry([...manifest, mismatched])).toThrow(
      "Server tool context contract mismatch: createChart; expected=run",
    );
  });
});
