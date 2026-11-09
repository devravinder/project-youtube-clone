import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

export interface ClaimedMessage {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
  traceContext?: Record<string, string> | null;
}

export interface OutboxStore {
  // Leases due rows so other relays skip them; an expired lease makes them due again.
  claimDue(types: string[], limit: number, leaseSeconds: number): Promise<ClaimedMessage[]>;
  markSent(id: string): Promise<void>;
  markFailed(id: string, error: string, nextAttemptAt: Date): Promise<void>;
  deleteSentBefore(cutoff: Date): Promise<number>;
  countPending(): Promise<number>;
}

export const OUTBOX_STORE = Symbol("OUTBOX_STORE");

// Columns are timestamp without time zone holding UTC, as Prisma writes them.
const NOW_UTC = `(now() AT TIME ZONE 'UTC')`;

@Injectable()
export class PrismaOutboxStore implements OutboxStore {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  claimDue(types: string[], limit: number, leaseSeconds: number): Promise<ClaimedMessage[]> {
    // SKIP LOCKED lets several replicas claim disjoint batches without waiting on each other.
    // RETURNING ignores the subquery's order, so the CTE sorts the claimed rows again.
    return this.prisma.$queryRawUnsafe<ClaimedMessage[]>(
      `WITH claimed AS (
         UPDATE outbox SET locked_until = ${NOW_UTC} + make_interval(secs => $3)
         WHERE id IN (
           SELECT id FROM outbox
           WHERE sent_at IS NULL
             AND type = ANY($1::text[])
             AND next_attempt_at <= ${NOW_UTC}
             AND (locked_until IS NULL OR locked_until < ${NOW_UTC})
           ORDER BY created_at, id
           LIMIT $2
           FOR UPDATE SKIP LOCKED)
         RETURNING id, type, payload, attempts, trace_context, created_at)
       SELECT id, type, payload, attempts, trace_context AS "traceContext"
       FROM claimed ORDER BY created_at, id`,
      types,
      limit,
      leaseSeconds,
    );
  }

  async markSent(id: string): Promise<void> {
    await this.prisma.outboxMessage.update({
      where: { id },
      data: { sentAt: new Date(), lockedUntil: null, lastError: null },
    });
  }

  async markFailed(id: string, error: string, nextAttemptAt: Date): Promise<void> {
    await this.prisma.outboxMessage.update({
      where: { id },
      data: {
        attempts: { increment: 1 },
        lastError: error.slice(0, 1000),
        nextAttemptAt,
        lockedUntil: null,
      },
    });
  }

  async deleteSentBefore(cutoff: Date): Promise<number> {
    const { count } = await this.prisma.outboxMessage.deleteMany({
      where: { sentAt: { lt: cutoff } },
    });
    return count;
  }

  countPending(): Promise<number> {
    return this.prisma.outboxMessage.count({ where: { sentAt: null } });
  }
}
