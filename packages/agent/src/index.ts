export { createChatModel, createTitleModel, type ModelConfig } from "./model.js";
export { buildSystemPrompt, DEFAULT_PROMPT } from "./prompt/systemPrompt.js";
export { formatAIError } from "./runtime/formatAIError.js";
export { type StreamChatInput, streamChat } from "./runtime/streamChat.js";
export {
  type BudgetableToolSet,
  DEFAULT_READ_SHEET_BUDGET_TOKENS,
  DEFAULT_TOOL_RESULT_BUDGET_TOKENS,
  DEFAULT_TOOL_RESULT_MAX_TOKENS,
  ToolResultBudget,
  type ToolResultBudgetOptions,
  type ToolResultBudgetSnapshot,
  wrapToolSetWithResultBudget,
} from "./runtime/toolResultBudget.js";
export {
  buildWorkspaceContext,
  type WorkspaceSheetSummary,
  type WorkspaceWorkbookSummary,
} from "./session/context.js";
export {
  DEFAULT_CONTEXT_WINDOW_TOKENS,
  DEFAULT_MAX_CONVERSATION_TURNS,
  DEFAULT_MAX_USER_INPUT_TOKENS,
  DEFAULT_OUTPUT_RESERVE_TOKENS,
  estimateTokens,
  trimMessagesToContextWindow,
} from "./session/contextWindow.js";
export { historyFromRuns } from "./session/transcript.js";
export {
  buildExcelToolCatalog,
  buildExcelToolContext,
  buildRunToolContext,
  buildWorkspaceToolContext,
  type ExcelToolName,
  excelToolSpecs,
  type RunToolContext,
  runToolContextSchema,
  type WorkspaceToolContext,
  workspaceToolContextSchema,
} from "./tools/index.js";
