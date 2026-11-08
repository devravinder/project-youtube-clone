import { randomUUID } from "node:crypto";
import type { Video } from "../generated/prisma/client.js";
import type { PrismaService } from "../prisma/prisma.service.js";

type Row = Video;
type NewRow = Partial<Row> & Pick<Row, "rawBucket" | "rawKey" | "contentType" | "title">;

interface Where {
  status?: string | { not: string };
  createdAt?: { lt: Date };
  id?: { notIn: string[] };
}

interface FindManyArgs {
  where?: Where;
  take?: number;
  cursor?: { id: string };
}

const matches = (row: Row, where: Where = {}): boolean => {
  const { status, createdAt, id } = where;
  if (typeof status === "string" && row.status !== status) return false;
  if (typeof status === "object" && row.status === status.not) return false;
  if (createdAt && !(row.createdAt < createdAt.lt)) return false;
  if (id && id.notIn.includes(row.id)) return false;
  return true;
};

// The small slice of the Prisma video API that the services use, held in memory.
export class FakePrisma {
  readonly rows = new Map<string, Row>();

  readonly video = {
    create: ({ data }: { data: NewRow }): Promise<Row> => {
      const now = new Date();
      const row: Row = {
        id: randomUUID(),
        description: null,
        status: "PENDING",
        viewCount: 0n,
        ownerId: null,
        uploadId: null,
        partSize: null,
        partCount: null,
        fileSize: null,
        createdAt: now,
        updatedAt: now,
        ...data,
      } as Row;
      this.rows.set(row.id, row);
      return Promise.resolve(row);
    },

    findUnique: ({ where }: { where: { id: string } }): Promise<Row | null> =>
      Promise.resolve(this.rows.get(where.id) ?? null),

    findMany: ({ where, take, cursor }: FindManyArgs = {}): Promise<Row[]> => {
      const sorted = [...this.rows.values()]
        .filter((row) => matches(row, where))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
      const start = cursor ? sorted.findIndex((row) => row.id === cursor.id) : 0;
      return Promise.resolve(sorted.slice(Math.max(start, 0), take ? start + take : undefined));
    },

    update: ({ where, data }: { where: { id: string }; data: Partial<Row> }): Promise<Row> => {
      const row = this.rows.get(where.id);
      if (!row) return Promise.reject(new Error("Record to update not found"));
      const updated = { ...row, ...data, updatedAt: new Date() };
      this.rows.set(where.id, updated);
      return Promise.resolve(updated);
    },

    delete: ({ where }: { where: { id: string } }): Promise<Row> => {
      const row = this.rows.get(where.id);
      if (!row) return Promise.reject(new Error("Record to delete not found"));
      this.rows.delete(where.id);
      return Promise.resolve(row);
    },
  };

  reset(): void {
    this.rows.clear();
  }

  asPrismaService(): PrismaService {
    return this as unknown as PrismaService;
  }

  // Test helper: insert a row directly, e.g. to backdate createdAt.
  seed(data: NewRow): Row {
    const row = { ...this.makeDefaults(), ...data } as Row;
    this.rows.set(row.id, row);
    return row;
  }

  private makeDefaults(): Row {
    const now = new Date();
    return {
      id: randomUUID(),
      description: null,
      status: "PENDING",
      viewCount: 0n,
      ownerId: null,
      uploadId: null,
      partSize: null,
      partCount: null,
      fileSize: null,
      createdAt: now,
      updatedAt: now,
    } as Row;
  }
}
