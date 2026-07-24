export {
  createChatModel,
  createFixedResponseModel,
  createMockModel,
  type ModelConfig,
  type ModelPurpose,
  resolveModelForPurpose,
} from "./model.js";
export { buildSystemPrompt, DEFAULT_PROMPT } from "./prompt/systemPrompt.js";
export type {
  AgentEvent,
  AgentEventSink,
  AgentEventType,
  AgentRunCompletion,
  AgentRunResult,
  AgentTimeoutConfiguration,
  AgentToolDefinition,
  AgentToolExecutionOptions,
  PersistenceBarrier,
  ToolExecutor,
} from "./runtime/contracts.js";
export { formatAIError } from "./runtime/errors/formatAIError.js";
export {
  AgentRunner,
  type AgentRunnerInput,
  createAgentRunner,
} from "./runtime/loop/agentRunner.js";
export {
  isToolError,
  type ToolError,
  type ToolErrorKind,
  ToolExecutionError,
  ToolInputValidationError,
  ToolNotFoundError,
  ToolPermissionError,
  ToolRateLimitError,
  ToolTimeoutError,
  toToolError,
} from "./runtime/tools/errors.js";
export {
  type ValidationResult,
  validateAndTransform,
  validateToolInput,
} from "./runtime/tools/inputValidation.js";
export {
  type SerializationOptions,
  type SerializationResult,
  serializeAndValidate,
  serializeToolOutput,
} from "./runtime/tools/outputSerialization.js";
export {
  createAgentToolSet,
  type ToolAdapterHooks,
  type ToolAdapterOptions,
} from "./runtime/tools/toolAdapter.js";
export {
  type BudgetableToolSet,
  DEFAULT_READ_SHEET_DATA_BUDGET_TOKENS,
  DEFAULT_TOOL_RESULT_BUDGET_TOKENS,
  DEFAULT_TOOL_RESULT_MAX_TOKENS,
  type ToolExecutionBudget,
  ToolResultBudget,
  type ToolResultBudgetOptions,
  type ToolResultBudgetSnapshot,
  type ToolResultPolicy,
  wrapToolSetWithResultBudget,
} from "./runtime/tools/toolResultBudget.js";
export {
  COMPACTION_CHECKPOINT_MARKER,
  type CompactionConfig,
  type CompactionResult,
  type Compactor,
  compactMessagesIfNeeded,
  createCompactor,
  ModelCompactor,
} from "./session/compaction.js";
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
export { historyFromRuns, removeEmptyAssistantMessages } from "./session/transcript.js";
export {
  buildExcelToolCatalog,
  buildExcelToolContext,
  buildExcelToolDefinitions,
  buildRunToolContext,
  buildWorkspaceToolContext,
  type ExcelToolName,
  excelToolSpecs,
  type RunToolContext,
  runToolContextSchema,
  type WorkspaceToolContext,
  workspaceToolContextSchema,
} from "./tools/index.js";
