import { randomUUID } from "node:crypto";
import { prisma } from "../../../infra/database/db.js";
import type { Prisma } from "../../../infra/database/prismaTypes.js";
import { SessionBusyError } from "../domain/sessionErrors.js";

export const RUN_LEASE_DURATION_MS = 30_000;
export const RUN_LEASE_HEARTBEAT_MS = 10_000;

type LeaseSession = {
  id: number;
  leaseOwnerId: string | null;
  leaseExpiresAt: Date | null;
  version: number;
  chatMessages: string | null;
};

function parseTranscript(value: string | null): unknown[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function leaseIsAvailable(session: LeaseSession, now: Date) {
  return (
    (session.leaseOwnerId == null && session.leaseExpiresAt == null) ||
    (session.leaseExpiresAt != null && session.leaseExpiresAt <= now)
  );
}

export interface AcquiredRunLease {
  run: Awaited<ReturnType<typeof createLeasedRun>>;
  ownerId: string;
  sessionVersion: number;
  transcript: unknown[];
  heartbeat(): Promise<boolean>;
  startHeartbeat(onLost: () => void): void;
  release(): Promise<void>;
}

async function createLeasedRun(
  tx: Prisma.TransactionClient,
  data: {
    sessionId: number;
    requestId: string;
    inputText: string;
    model?: string;
    ownerId: string;
    sessionVersion: number;
    leaseExpiresAt: Date;
    heartbeatAt: Date;
    requestPayloadHash?: string;
  },
) {
  return tx.agentRun.create({
    data: {
      sessionId: data.sessionId,
      status: "running",
      clientRequestId: data.requestId,
      inputText: data.inputText,
      model: data.model,
      ownerId: data.ownerId,
      sessionVersion: data.sessionVersion,
      leaseExpiresAt: data.leaseExpiresAt,
      heartbeatAt: data.heartbeatAt,
      requestPayloadHash: data.requestPayloadHash,
    },
  });
}

export async function acquireRunLease(data: {
  workspaceId: number;
  sessionId: number;
  requestId: string;
  inputText: string;
  model?: string;
  requestPayloadHash?: string;
  appendUserTurn(transcript: unknown[]): unknown[];
  now?: Date;
  leaseDurationMs?: number;
}): Promise<AcquiredRunLease> {
  const ownerId = randomUUID();
  const now = data.now ?? new Date();
  const leaseDurationMs = data.leaseDurationMs ?? RUN_LEASE_DURATION_MS;
  const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

  const acquired = await prisma.$transaction(async (tx) => {
    const session = await tx.session.findFirst({
      where: { id: data.sessionId, workspaceId: data.workspaceId },
      select: {
        id: true,
        leaseOwnerId: true,
        leaseExpiresAt: true,
        version: true,
        chatMessages: true,
      },
    });
    if (!session) throw new Error("Session not found");

    if (!leaseIsAvailable(session, now)) throw new SessionBusyError();

    if (session.leaseOwnerId && session.leaseExpiresAt && session.leaseExpiresAt <= now) {
      await tx.agentRun.updateMany({
        where: {
          sessionId: data.sessionId,
          status: "running",
          ownerId: session.leaseOwnerId,
        },
        data: {
          status: "recovery_required",
          errorMessage: "运行租约已过期，等待恢复器检查最后持久化边界",
          endedAt: now,
        },
      });
    }

    const nextVersion = session.version + 1;
    const claimed = await tx.session.updateMany({
      where: {
        id: data.sessionId,
        workspaceId: data.workspaceId,
        version: session.version,
        OR: [{ leaseOwnerId: null, leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
      },
      data: {
        leaseOwnerId: ownerId,
        leaseExpiresAt,
        leaseHeartbeatAt: now,
        version: nextVersion,
      },
    });
    if (claimed.count !== 1) throw new SessionBusyError();

    const canonicalTranscript = parseTranscript(session.chatMessages);
    const transcript = data.appendUserTurn(canonicalTranscript);
    await tx.session.update({
      where: { id: data.sessionId },
      data: { chatMessages: JSON.stringify(transcript) },
    });

    const run = await createLeasedRun(tx, {
      sessionId: data.sessionId,
      requestId: data.requestId,
      inputText: data.inputText,
      model: data.model,
      ownerId,
      sessionVersion: nextVersion,
      leaseExpiresAt,
      heartbeatAt: now,
      requestPayloadHash: data.requestPayloadHash,
    });

    return { run, transcript, sessionVersion: nextVersion };
  });

  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let released = false;
  let lost = false;

  const heartbeat = async () => {
    if (released || lost) return false;
    const heartbeatAt = new Date();
    const nextExpiresAt = new Date(heartbeatAt.getTime() + leaseDurationMs);
    const result = await prisma.session.updateMany({
      where: {
        id: data.sessionId,
        leaseOwnerId: ownerId,
        version: acquired.sessionVersion,
      },
      data: {
        leaseExpiresAt: nextExpiresAt,
        leaseHeartbeatAt: heartbeatAt,
      },
    });
    if (result.count !== 1) lost = true;
    if (result.count === 1) {
      await prisma.agentRun.updateMany({
        where: {
          id: acquired.run.id,
          status: "running",
          ownerId,
          sessionVersion: acquired.sessionVersion,
        },
        data: { leaseExpiresAt: nextExpiresAt, heartbeatAt },
      });
    }
    return result.count === 1;
  };

  return {
    run: acquired.run,
    ownerId,
    sessionVersion: acquired.sessionVersion,
    transcript: acquired.transcript,
    heartbeat,
    startHeartbeat(onLost: () => void) {
      heartbeatTimer ??= setInterval(() => {
        void heartbeat().then((alive) => {
          if (!alive && !released) onLost();
        });
      }, RUN_LEASE_HEARTBEAT_MS);
      heartbeatTimer.unref?.();
    },
    async release() {
      if (released) return;
      released = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      await prisma.session.updateMany({
        where: {
          id: data.sessionId,
          leaseOwnerId: ownerId,
          version: acquired.sessionVersion,
        },
        data: {
          leaseOwnerId: null,
          leaseExpiresAt: null,
          leaseHeartbeatAt: null,
        },
      });
    },
  };
}
