type RunLike = {
  inputText?: string | null;
  outputText?: string | null;
};

export function historyFromRuns(runs: RunLike[]) {
  const transcript: { role: "user" | "assistant"; content: string }[] = [];
  for (const run of runs) {
    if (run.inputText) transcript.push({ role: "user", content: run.inputText });
    if (run.outputText) transcript.push({ role: "assistant", content: run.outputText });
  }
  return transcript;
}
