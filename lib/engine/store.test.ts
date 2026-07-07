import { describe, expect, it } from "vitest";
import { MemoryStore } from "./store";
import type { MemoryRecord } from "./types";

const NOW = Date.parse("2026-07-06T12:00:00Z");

let seq = 0;
function mem(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  seq += 1;
  return {
    id: `m${seq}`,
    type: "fact",
    content: "user prefers TypeScript strict mode",
    embedding: [0.25, -0.5, 1],
    importance: 0.5,
    createdAt: NOW - 1000,
    lastAccessedAt: NOW - 1000,
    accessCount: 0,
    sessionId: "s1",
    status: "active",
    supersededBy: null,
    ...overrides,
  };
}

function freshStore(): MemoryStore {
  return new MemoryStore(":memory:");
}

describe("MemoryStore round-trip", () => {
  it("returns an inserted record with every field intact, embedding included", () => {
    const store = freshStore();
    const record = mem({
      type: "preference",
      content: "dark mode, always",
      embedding: [0.1, 0.2, 0.30000000000000004, -1],
      importance: 0.87,
      accessCount: 3,
      sessionId: "session-xyz",
    });
    store.insert(record);
    expect(store.get(record.id)).toEqual(record);
  });

  it("round-trips a superseded record including the supersededBy pointer", () => {
    const store = freshStore();
    const record = mem({ status: "superseded", supersededBy: "m-newer" });
    store.insert(record);
    expect(store.get(record.id)).toEqual(record);
  });

  it("returns null for an unknown id", () => {
    const store = freshStore();
    expect(store.get("nope")).toBeNull();
  });
});

describe("MemoryStore.allActive / all", () => {
  it("allActive returns only active records; all returns everything", () => {
    const store = freshStore();
    const active = mem({ status: "active" });
    const decayed = mem({ status: "decayed" });
    const superseded = mem({ status: "superseded", supersededBy: active.id });
    for (const r of [active, decayed, superseded]) store.insert(r);

    expect(store.allActive().map((r) => r.id)).toEqual([active.id]);
    expect(store.all().map((r) => r.id).sort()).toEqual(
      [active.id, decayed.id, superseded.id].sort(),
    );
  });
});

describe("MemoryStore.markSuperseded", () => {
  it("sets status and the pointer, removes from allActive, but never deletes", () => {
    const store = freshStore();
    const old = mem();
    const replacement = mem();
    store.insert(old);
    store.insert(replacement);

    store.markSuperseded(old.id, replacement.id);

    const got = store.get(old.id);
    expect(got).not.toBeNull();
    expect(got!.status).toBe("superseded");
    expect(got!.supersededBy).toBe(replacement.id);
    expect(store.allActive().map((r) => r.id)).toEqual([replacement.id]);
    expect(store.all().length).toBe(2);
  });
});

describe("MemoryStore.markDecayed", () => {
  it("sets status decayed and excludes the record from allActive", () => {
    const store = freshStore();
    const record = mem();
    store.insert(record);

    store.markDecayed(record.id);

    expect(store.get(record.id)!.status).toBe("decayed");
    expect(store.allActive()).toEqual([]);
    expect(store.all().length).toBe(1);
  });
});

describe("MemoryStore.refreshAccess", () => {
  it("bumps lastAccessedAt and accessCount for the listed ids only", () => {
    const store = freshStore();
    const touched = mem({ lastAccessedAt: NOW - 5000, accessCount: 2 });
    const alsoTouched = mem({ lastAccessedAt: NOW - 9000, accessCount: 0 });
    const untouched = mem({ lastAccessedAt: NOW - 7000, accessCount: 7 });
    for (const r of [touched, alsoTouched, untouched]) store.insert(r);

    store.refreshAccess([touched.id, alsoTouched.id], NOW);

    expect(store.get(touched.id)).toMatchObject({ lastAccessedAt: NOW, accessCount: 3 });
    expect(store.get(alsoTouched.id)).toMatchObject({ lastAccessedAt: NOW, accessCount: 1 });
    expect(store.get(untouched.id)).toMatchObject({
      lastAccessedAt: NOW - 7000,
      accessCount: 7,
    });
  });

  it("is a no-op for an empty id list", () => {
    const store = freshStore();
    const record = mem({ accessCount: 4 });
    store.insert(record);
    store.refreshAccess([], NOW);
    expect(store.get(record.id)!.accessCount).toBe(4);
  });
});

describe("MemoryStore.counts", () => {
  it("counts records per status, with zeros for empty statuses", () => {
    const store = freshStore();
    expect(store.counts()).toEqual({ active: 0, decayed: 0, superseded: 0 });

    store.insert(mem());
    store.insert(mem());
    const dying = mem();
    store.insert(dying);
    store.markDecayed(dying.id);
    const stale = mem();
    store.insert(stale);
    store.markSuperseded(stale.id, "whatever");

    expect(store.counts()).toEqual({ active: 2, decayed: 1, superseded: 1 });
  });
});
