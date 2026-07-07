import Database from "better-sqlite3";
import type { MemoryRecord, MemoryStatus, MemoryType } from "./types";

interface MemoryRow {
  id: string;
  type: string;
  content: string;
  embedding: string;
  importance: number;
  created_at: number;
  last_accessed_at: number;
  access_count: number;
  session_id: string;
  status: string;
  superseded_by: string | null;
}

function toRecord(row: MemoryRow): MemoryRecord {
  return {
    id: row.id,
    type: row.type as MemoryType,
    content: row.content,
    embedding: JSON.parse(row.embedding) as number[],
    importance: row.importance,
    createdAt: row.created_at,
    lastAccessedAt: row.last_accessed_at,
    accessCount: row.access_count,
    sessionId: row.session_id,
    status: row.status as MemoryStatus,
    supersededBy: row.superseded_by,
  };
}

/**
 * SQLite-backed memory persistence. Audit-preserving by construction: rows are
 * only ever inserted or status-flipped, never deleted (spec S3/S4). Pass
 * ":memory:" for an ephemeral test database.
 */
export class MemoryStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding TEXT NOT NULL,
        importance REAL NOT NULL,
        created_at INTEGER NOT NULL,
        last_accessed_at INTEGER NOT NULL,
        access_count INTEGER NOT NULL,
        session_id TEXT NOT NULL,
        status TEXT NOT NULL,
        superseded_by TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_memories_status ON memories(status);
    `);
  }

  insert(record: MemoryRecord): void {
    this.db
      .prepare(
        `INSERT INTO memories
           (id, type, content, embedding, importance, created_at,
            last_accessed_at, access_count, session_id, status, superseded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.type,
        record.content,
        JSON.stringify(record.embedding),
        record.importance,
        record.createdAt,
        record.lastAccessedAt,
        record.accessCount,
        record.sessionId,
        record.status,
        record.supersededBy,
      );
  }

  get(id: string): MemoryRecord | null {
    const row = this.db.prepare("SELECT * FROM memories WHERE id = ?").get(id) as
      | MemoryRow
      | undefined;
    return row ? toRecord(row) : null;
  }

  allActive(): MemoryRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM memories WHERE status = 'active' ORDER BY created_at, id")
      .all() as MemoryRow[];
    return rows.map(toRecord);
  }

  all(): MemoryRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM memories ORDER BY created_at, id")
      .all() as MemoryRow[];
    return rows.map(toRecord);
  }

  /** Truth maintenance is a status flip plus a pointer, never a DELETE. */
  markSuperseded(id: string, byId: string): void {
    this.db
      .prepare("UPDATE memories SET status = 'superseded', superseded_by = ? WHERE id = ?")
      .run(byId, id);
  }

  markDecayed(id: string): void {
    this.db.prepare("UPDATE memories SET status = 'decayed' WHERE id = ?").run(id);
  }

  /** Recall refreshes retention: bump lastAccessedAt and accessCount atomically. */
  refreshAccess(ids: string[], now: number): void {
    if (ids.length === 0) return;
    const bump = this.db.prepare(
      "UPDATE memories SET last_accessed_at = ?, access_count = access_count + 1 WHERE id = ?",
    );
    const run = this.db.transaction((targets: string[]) => {
      for (const id of targets) bump.run(now, id);
    });
    run(ids);
  }

  counts(): { active: number; decayed: number; superseded: number } {
    const rows = this.db
      .prepare("SELECT status, COUNT(*) AS n FROM memories GROUP BY status")
      .all() as { status: string; n: number }[];
    const result = { active: 0, decayed: 0, superseded: 0 };
    for (const row of rows) {
      if (row.status in result) result[row.status as MemoryStatus] = row.n;
    }
    return result;
  }

  close(): void {
    this.db.close();
  }
}
