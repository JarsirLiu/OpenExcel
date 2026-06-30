import { jsonSchema, tool } from "ai";

export type ToolSet = Record<string, any>;

export function createAgentTools(deps: { sheetLookup: (sheetId: number) => Promise<unknown> }): ToolSet {
  return {
    sheet_lookup: tool({
      description: "读取指定 sheet 的数据",
      inputSchema: jsonSchema<{ sheetId: number }>({
        type: "object",
        properties: {
          sheetId: { type: "integer" },
        },
        required: ["sheetId"],
        additionalProperties: false,
      }),
      execute: async ({ sheetId }: { sheetId: number }) => deps.sheetLookup(sheetId),
    }),
  };
}