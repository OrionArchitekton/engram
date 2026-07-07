"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DemoBoardMemory, DemoEvent, DemoFixture, DemoTurn } from "@/lib/demo-fixture";

type Turn = DemoTurn;
type MemoryEvent = DemoEvent;
type BoardMemory = DemoBoardMemory;

interface Board {
  counts: { active: number; decayed: number; superseded: number };
  memories: BoardMemory[];
}

const EVENT_STYLE: Record<MemoryEvent["kind"], { label: string; cls: string }> = {
  recalled: { label: "RECALLED", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  stored: { label: "STORED", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  superseded: { label: "SUPERSEDED", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  decayed: { label: "DECAYED", cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
  skipped: { label: "NOT STORED", cls: "bg-zinc-700/20 text-zinc-500 border-zinc-600/30" },
};

const TYPE_STYLE: Record<string, string> = {
  preference: "bg-violet-500/15 text-violet-300",
  fact: "bg-sky-500/15 text-sky-300",
  skill: "bg-emerald-500/15 text-emerald-300",
  episode: "bg-zinc-500/15 text-zinc-400",
};

function EventChip({ ev }: { ev: MemoryEvent }) {
  const s = EVENT_STYLE[ev.kind];
  return (
    <div data-kind={ev.kind} className={`engram-event-enter rounded-md border px-3 py-2 text-xs ${s.cls}`}>
      <div className="flex items-center gap-2">
        <span className="font-semibold tracking-wide">{s.label}</span>
        {ev.type && <span className="opacity-70">{ev.type}</span>}
        {typeof ev.score === "number" && (
          <span className="ml-auto tabular-nums opacity-70">{ev.score.toFixed(2)}</span>
        )}
      </div>
      <div className="mt-1 line-clamp-2 text-zinc-300">{ev.content}</div>
      {ev.detail && <div className="mt-0.5 text-[10px] opacity-60">{ev.detail}</div>}
    </div>
  );
}

function MemoryRow({ m }: { m: BoardMemory }) {
  const faded = m.status !== "active";
  return (
    <div
      className={`rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 ${faded ? "opacity-45" : ""}`}
    >
      <div className="flex items-center gap-2 text-[10px]">
        <span className={`rounded px-1.5 py-0.5 font-medium ${TYPE_STYLE[m.type] ?? TYPE_STYLE.fact}`}>
          {m.type}
        </span>
        {m.status !== "active" && (
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 uppercase text-zinc-500">
            {m.status}
          </span>
        )}
        <span className="ml-auto tabular-nums text-zinc-500">
          {m.accessCount > 0 ? `recalled x${m.accessCount}` : "never recalled"}
        </span>
      </div>
      <div className="mt-1 text-xs text-zinc-300">{m.content}</div>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded bg-zinc-800">
          <div
            className="h-full rounded bg-gradient-to-r from-indigo-500 to-sky-400"
            style={{ width: `${Math.round(m.retention * 100)}%` }}
          />
        </div>
        <span className="text-[10px] tabular-nums text-zinc-500">
          retention {(m.retention * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

export default function EngramApp({ fixture }: { fixture: DemoFixture | null }) {
  const [sessions, setSessions] = useState<Record<string, Turn[]>>(
    fixture?.sessions ?? { "session-a": [] },
  );
  const [active, setActive] = useState(fixture?.activeSession ?? "session-a");
  const [events, setEvents] = useState<MemoryEvent[]>(fixture?.events ?? []);
  const [board, setBoard] = useState<Board | null>(fixture?.board ?? null);
  const [input, setInput] = useState(fixture?.input ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);

  const demo = fixture !== null;
  const sessionIds = Object.keys(sessions);
  const turns = sessions[active] ?? [];

  const refreshBoard = useCallback(async () => {
    try {
      const res = await fetch("/api/memories");
      if (res.ok) setBoard(await res.json());
    } catch {
      // board refresh is cosmetic; never break chat on it
    }
  }, []);

  useEffect(() => {
    if (!demo) void refreshBoard();
  }, [demo, refreshBoard]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length]);

  async function send() {
    const message = input.trim();
    if (!message || busy) return;
    setBusy(true);
    setError(null);
    setInput("");
    setSessions((s) => ({ ...s, [active]: [...(s[active] ?? []), { role: "user", content: message }] }));
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: active, message, history: turns }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status}).`);
      } else {
        setSessions((s) => ({
          ...s,
          [active]: [...(s[active] ?? []), { role: "assistant", content: data.reply }],
        }));
        setEvents((e) => [...data.events.slice().reverse(), ...e].slice(0, 40));
        await refreshBoard();
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function endSession() {
    if (busy || turns.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/consolidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: active, turns }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status}).`);
      } else {
        setEvents((e) => [...data.events.slice().reverse(), ...e].slice(0, 40));
        await refreshBoard();
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function newSession() {
    const next = `session-${String.fromCharCode(97 + sessionIds.length)}`;
    setSessions((s) => ({ ...s, [next]: [] }));
    setActive(next);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-5">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-50">
          engram<span className="text-indigo-400">.</span>
        </h1>
        <p className="text-xs text-zinc-500">a memory engine for AI agents</p>
        <span className="ml-auto rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[10px] text-zinc-400">
          qwen3.7-plus + text-embedding-v4 on Qwen Cloud
        </span>
        {board && (
          <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[10px] tabular-nums text-zinc-400">
            {board.counts.active} active / {board.counts.decayed} decayed / {board.counts.superseded}{" "}
            superseded
          </span>
        )}
      </header>

      <div className="grid flex-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
        <section className="flex min-h-[70vh] flex-col rounded-xl border border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-1.5 border-b border-zinc-800 px-3 py-2">
            {sessionIds.map((id) => (
              <button
                key={id}
                onClick={() => setActive(id)}
                className={`rounded-md px-2.5 py-1 text-xs transition ${
                  id === active
                    ? "bg-indigo-500/20 text-indigo-300"
                    : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
                }`}
              >
                {id.replace("session-", "session ")}
              </button>
            ))}
            <button
              onClick={newSession}
              className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
              title="Start a fresh session (new context; memories persist)"
            >
              + new
            </button>
            <button
              onClick={endSession}
              disabled={busy || turns.length === 0}
              className="ml-auto rounded-md border border-zinc-800 px-2.5 py-1 text-xs text-zinc-400 hover:bg-zinc-900 disabled:opacity-40"
              title="Distill this session into durable memories"
            >
              consolidate session
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {turns.length === 0 && (
              <p className="pt-10 text-center text-sm text-zinc-600">
                Fresh session. The agent starts with no context except what Engram recalls.
              </p>
            )}
            {turns.map((t, i) => (
              <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                    t.role === "user"
                      ? "bg-indigo-500/20 text-indigo-100"
                      : "bg-zinc-900 text-zinc-300"
                  }`}
                >
                  {t.content}
                </div>
              </div>
            ))}
            {busy && <p className="text-xs text-zinc-600">thinking + remembering...</p>}
            {error && <p className="text-xs text-rose-400">{error}</p>}
            <div ref={chatEnd} />
          </div>

          <div className="border-t border-zinc-800 p-3">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
                placeholder="Tell the agent something worth remembering..."
                className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-indigo-500/50"
              />
              <button
                onClick={send}
                disabled={busy || !input.trim()}
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-40"
              >
                send
              </button>
            </div>
          </div>
        </section>

        <section className="flex min-h-[70vh] flex-col gap-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Memory events
            </h2>
            <div className="max-h-[32vh] space-y-2 overflow-y-auto pr-1">
              {events.length === 0 && (
                <p className="py-6 text-center text-xs text-zinc-600">
                  Engine decisions appear here: recall, store, supersede, decay.
                </p>
              )}
              {events.map((ev, i) => (
                <EventChip key={`${ev.memoryId}-${i}`} ev={ev} />
              ))}
            </div>
          </div>

          <div className="flex-1 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Memory store
            </h2>
            <div className="max-h-[38vh] space-y-2 overflow-y-auto pr-1">
              {!board || board.memories.length === 0 ? (
                <p className="py-6 text-center text-xs text-zinc-600">No memories yet.</p>
              ) : (
                board.memories.map((m) => <MemoryRow key={m.id} m={m} />)
              )}
            </div>
          </div>
        </section>
      </div>

      <footer className="mt-4 flex items-center gap-2 text-[10px] text-zinc-600">
        <span>
          Engram picks what to recall under a hard token budget, forgets what goes stale, and
          adjudicates contradictions.
        </span>
        <a
          className="ml-auto underline decoration-zinc-700 hover:text-zinc-400"
          href="https://github.com/OrionArchitekton/engram"
          target="_blank"
          rel="noreferrer"
        >
          source
        </a>
      </footer>
    </div>
  );
}
