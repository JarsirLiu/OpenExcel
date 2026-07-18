import { z } from "zod";

const cellAddressSchema = z.object({
  row: z.number().int().min(0),
  col: z.number().int().min(0),
});

const rangeReferenceSchema = z
  .object({
    sheetId: z.string().min(1),
    start: cellAddressSchema,
    end: cellAddressSchema,
  })
  .superRefine((range, ctx) => {
    if (range.end.row < range.start.row || range.end.col < range.start.col) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end"],
        message: "chart data ranges must end at or after their start",
      });
    }

    const rowSpan = range.end.row - range.start.row + 1;
    const colSpan = range.end.col - range.start.col + 1;
    if (rowSpan > 1 && colSpan > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end"],
        message: "chart data ranges must be a single row or a single column",
      });
    }
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

    const categoryReferences = chart.series.map((series) => series.categoryRef);
    const hasCategories = categoryReferences.some((reference) => reference != null);
    const hasMissingCategories = categoryReferences.some((reference) => reference == null);
    if (hasCategories && hasMissingCategories) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["series"],
        message: "all chart series must either define categories or omit them",
      });
    }
    const firstCategory = categoryReferences.find((reference) => reference != null);
    if (
      firstCategory &&
      categoryReferences.some(
        (reference) => reference != null && !sameRangeReference(firstCategory, reference),
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["series"],
        message: "all chart series must use the same category reference",
      });
    }
    if (chart.type === "pie" && chart.series.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["series"],
        message: "pie charts must contain exactly one series",
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

      if (chart.type === "scatter" && series.categoryRef == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["series", index, "categoryRef"],
          message: "scatter charts require x-axis references",
        });
      }

      if (series.categoryRef) {
        const categoryLength = rangeLength(series.categoryRef);
        const valueLength = rangeLength(series.valueRef);
        if (categoryLength !== valueLength) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["series", index, "valueRef"],
            message: "category and value references must have the same length",
          });
        }
      }

      if (chart.type === "combo") {
        if (series.chartType == null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["series", index, "chartType"],
            message: "combo chart series must declare a chart type",
          });
        } else if (!["bar", "line", "area"].includes(series.chartType)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["series", index, "chartType"],
            message: "combo charts currently support bar, line, and area series",
          });
        }
      } else if (series.chartType != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["series", index, "chartType"],
          message: "series chart types are only valid for combo charts",
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

function rangeLength(range: RangeReference): number {
  return Math.max(range.end.row - range.start.row, range.end.col - range.start.col) + 1;
}

function sameRangeReference(left: RangeReference, right: RangeReference): boolean {
  return (
    left.sheetId === right.sheetId &&
    left.start.row === right.start.row &&
    left.start.col === right.start.col &&
    left.end.row === right.end.row &&
    left.end.col === right.end.col
  );
}

export function parseChartSpec(input: unknown): ChartSpec {
  return chartSpecSchema.parse(input);
}

export function isChartSpec(input: unknown): input is ChartSpec {
  return chartSpecSchema.safeParse(input).success;
}
