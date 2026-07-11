export { createChatModel, createTitleModel, type ModelConfig } from "./model.js";
export { buildSystemPrompt, DEFAULT_PROMPT } from "./prompt/systemPrompt.js";
export { formatAIError } from "./runtime/formatAIError.js";
export { type StreamChatInput, streamChat } from "./runtime/streamChat.js";
export {
  buildWorkspaceContext,
  type WorkspaceSheetSummary,
  type WorkspaceWorkbookSummary,
} from "./session/context.js";
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
