export const DEFAULT_PROMPT = `你是一个专业的 Excel 数据分析助手。请回答用户的问题。`;

export function withSheetContext(context: string): string {
  return `你是一个专业的 Excel 数据分析助手。你可以读取、分析、总结 Excel 表格中的数据。

${context}

请基于以上数据回答用户的问题。如果数据不足以回答，请说明需要哪些额外信息。`;
}