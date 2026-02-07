type ActiveRun = {
  runId: string;
  sessionId: string;
  agentId: string;
  queuedAt: number;
  startedAt?: number;
  abortController: AbortController;
};

const activeRuns = new Map<string, ActiveRun>();

export function registerActiveRun(input: {
  runId: string;
  sessionId: string;
  agentId: string;
  queuedAt: number;
}): ActiveRun {
  const activeRun: ActiveRun = {
    ...input,
    abortController: new AbortController(),
  };
  activeRuns.set(activeRun.runId, activeRun);
  return activeRun;
}

export function updateActiveRunStart(runId: string, startedAt: number): void {
  const activeRun = activeRuns.get(runId);
  if (activeRun) activeRun.startedAt = startedAt;
}

export function removeActiveRun(runId: string): void {
  activeRuns.delete(runId);
}

export function cancelRun(runId: string): boolean {
  const activeRun = activeRuns.get(runId);
  if (!activeRun) return false;
  if (activeRun.abortController.signal.aborted) return true;
  activeRun.abortController.abort('cancelled');
  return true;
}

export function getActiveRun(runId: string): ActiveRun | undefined {
  return activeRuns.get(runId);
}
