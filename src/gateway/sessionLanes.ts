type SessionLane = {
  queue: Promise<void>;
  runCount: number;
  idleTimer?: NodeJS.Timeout;
};

const sessionLanes = new Map<string, SessionLane>();

export function getOrCreateSessionLane(sessionId: string) {
  const lane = sessionLanes.get(sessionId) || { queue: Promise.resolve(), runCount: 0 };
  sessionLanes.set(sessionId, lane);

  return {
    enqueue: (task: () => Promise<void>, idleMs: number = 300_000) =>
      enqueueOnLane(sessionId, lane, task, idleMs),
  };
}

function enqueueOnLane(
  sessionId: string,
  lane: SessionLane,
  task: () => Promise<void>,
  idleMs: number
): Promise<void> {
  if (lane.idleTimer) {
    clearTimeout(lane.idleTimer);
    lane.idleTimer = undefined;
  }

  lane.runCount += 1;

  const next = lane.queue
    .catch(() => undefined)
    .then(task)
    .finally(() => {
      lane.runCount -= 1;
      if (lane.runCount === 0) {
        lane.idleTimer = setTimeout(() => {
          const active = sessionLanes.get(sessionId);
          if (active && active.runCount === 0) {
            sessionLanes.delete(sessionId);
          }
        }, idleMs);
      }
    });

  lane.queue = next;
  return next;
}
