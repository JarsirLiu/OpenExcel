export type AssistantActivity = {
  assistantMessageId: string;
  phase: "initial" | "model-waiting" | "responding" | "tool-running" | "compacting";
  showPulse: boolean;
};
