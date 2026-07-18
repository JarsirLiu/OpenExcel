import { z } from "zod";

const cellAddressSchema = z.object({
  row: z.number().int().min(0),
  col: z.number().int().min(0),
});

const rangeReferenceSchema = z.object({
  sheetId: z.string().min(1),
  start: cellAddressSchema,
  end: cellAddressSchema,
});

const anchorPointSchema = cellAddressSchema.extend({
  offsetXEmu: z.number().int().min(0).optional(),
  offsetYEmu: z.number().int().min(0).optional(),
});

const oneCellAnchorSchema = z.object({
  kind: z.literal("oneCell"),
  from: anchorPointSchema,
  widthEmu: z.number().int().positive(),
  heightEmu: z.number().int().positive(),
});

const twoCellAnchorSchema = z.object({
  kind: z.literal("twoCell"),
  from: anchorPointSchema,
  to: anchorPointSchema,
});

const absoluteAnchorSchema = z.object({
  kind: z.literal("absolute"),
  xEmu: z.number().int().min(0),
  yEmu: z.number().int().min(0),
  widthEmu: z.number().int().positive(),
  heightEmu: z.number().int().positive(),
});

const chartAnchorSchema = z.union([oneCellAnchorSchema, twoCellAnchorSchema, absoluteAnchorSchema]);

const chartSeriesNameSchema = z.union([z.string().min(1), rangeReferenceSchema]);

const chartSeriesSchema = z.object({
  id: z.string().min(1),
  name: chartSeriesNameSchema.optional(),
  categoryRef: rangeReferenceSchema.optional(),
  valueRef: rangeReferenceSchema,
  chartType: z.enum(["bar", "line", "pie", "area", "scatter"]).optional(),
});

export const chartSpecSchema = z
  .object({
    id: z.string().min(1),
    workbookId: z.string().min(1),
    sheetId: z.string().min(1),
    type: z.enum(["bar", "line", "pie", "area", "scatter", "combo"]),
    title: z.string().optional(),
    anchor: chartAnchorSchema,
    series: z.array(chartSeriesSchema).min(1),
  })
  .superRefine((chart, ctx) => {
    if (
      chart.anchor.kind === "twoCell" &&
      (chart.anchor.to.row < chart.anchor.from.row || chart.anchor.to.col < chart.anchor.from.col)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["anchor", "to"],
        message: "the ending anchor point must not precede the starting point",
      });
    }

    for (const [index, series] of chart.series.entries()) {
      if (chart.type === "pie" && series.categoryRef == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["series", index, "categoryRef"],
          message: "pie charts require category references",
        });
      }
    }
  });

export type CellAddress = z.infer<typeof cellAddressSchema>;
export type RangeReference = z.infer<typeof rangeReferenceSchema>;
export type ChartAnchorPoint = z.infer<typeof anchorPointSchema>;
export type ChartAnchor = z.infer<typeof chartAnchorSchema>;
export type ChartSeriesName = z.infer<typeof chartSeriesNameSchema>;
export type ChartSeriesSpec = z.infer<typeof chartSeriesSchema>;
export type ChartSpec = z.infer<typeof chartSpecSchema>;

export function parseChartSpec(input: unknown): ChartSpec {
  return chartSpecSchema.parse(input);
}

export function isChartSpec(input: unknown): input is ChartSpec {
  return chartSpecSchema.safeParse(input).success;
}
