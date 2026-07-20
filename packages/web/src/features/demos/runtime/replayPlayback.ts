import type { DemoPlayback } from "./replayTypes";

export const defaultDemoPlayback: DemoPlayback = {
  textTokenDelay: 24,
  textCompletionDelay: 220,
  toolStartDelay: 380,
  toolExecutionDuration: 780,
  stepDelay: 260,
  toolStepDelay: 420,
  restartDelay: 20,
};

export function resolveDemoPlayback(playback?: Partial<DemoPlayback>): DemoPlayback {
  return { ...defaultDemoPlayback, ...playback };
}
