// Non-reactive event index for the Events tab (stats-tab lesson — hard requirement).
// Built once per connection on first use and cached in a module-level WeakMap so the
// rows never become Vue reactive proxies; components consume the plain arrays/Maps via
// shallowRef/computed. No Vue imports here (the QlogConnection import is type-only, so
// it is fully erased at compile time). The connection and its events are never mutated.

import type QlogConnection from "@/data/Connection";
import { normalizeEventPair } from "@/data/QlogSupport";
import { summarizeEvent } from "./EventSummaries";

export interface EventLogRow {
    // index into connection.getEvents() — qlog events have no intrinsic ID, the array
    // index is the honest, stable identifier
    seq: number;
    // milliseconds relative to capture start
    relMs: number;
    // canonical spec-final spelling (draft transport:packet_sent → quic:packet_sent)
    category: string;
    name: string;
    // "category:name"
    typeStr: string;
    // per-type plain-text summary (EventSummaries)
    summary: string;
    // precomputed lowercase haystack for substring filtering
    searchStr: string;
    // every stream this event is associated with: direct data.stream_id ∪ all
    // data.frames[].stream_id — always normalized to strings (producers emit both
    // numbers and numeric strings)
    streamIds: string[];
}

export interface EventLogIndex {
    rows: EventLogRow[];
    // streamId → ascending seq[] of every event associated with that stream
    // (multi-membership: one packet carrying frames for 3 streams appears under all 3)
    streamIndex: Map<string, number[]>;
    // sorted unique canonical categories present (for the UI's category dropdown)
    categories: string[];
}

const indexCache = new WeakMap<QlogConnection, EventLogIndex>();

export function getEventLogIndex(connection: QlogConnection): EventLogIndex {
    let index = indexCache.get(connection);
    if (index === undefined) {
        index = buildEventLogIndex(connection);
        indexCache.set(connection, index);
    }
    return index;
}

function scalarToString(value: unknown): string | undefined {
    const type = typeof value;
    if (type === "string" || type === "number" || type === "bigint") {
        return String(value);
    }
    return undefined;
}

function collectStreamIds(data: any): string[] {
    if (typeof data !== "object" || data === null) {
        return [];
    }

    const ids = new Set<string>();

    const direct = scalarToString(data.stream_id);
    if (direct !== undefined) {
        ids.add(direct);
    }

    if (Array.isArray(data.frames)) {
        for (const frame of data.frames) {
            if (typeof frame !== "object" || frame === null) {
                continue;
            }
            // normalizeEventData renames draft frame.id → frame.stream_id, but stay
            // tolerant of raw shapes that never went through the loader normalization
            const frameId = scalarToString(frame.stream_id) ?? scalarToString(frame.id);
            if (frameId !== undefined) {
                ids.add(frameId);
            }
        }
    }

    return Array.from(ids);
}

function buildEventLogIndex(connection: QlogConnection): EventLogIndex {
    const events = connection.getEvents();
    // batch loop over every event: use the parser directly instead of parseEvent()
    // to skip Vue's ReactiveGetter overhead on large logs (see Connection.ts note)
    const parser = connection.getEventParser();

    const rows: EventLogRow[] = new Array(events.length);
    const streamIndex = new Map<string, number[]>();
    const categorySet = new Set<string>();

    for (let seq = 0; seq < events.length; seq++) {
        const parsed = parser.load(events[seq]);

        // the parsers already emit canonical spellings, but route through the shared
        // normalizeEventPair anyway so this index can never drift from the lookup-table
        // keying (idempotent for already-canonical input)
        const { category, name } = normalizeEventPair(parsed.category, parsed.name);
        const typeStr = `${category}:${name}`;

        const relativeTime = parsed.relativeTime;
        const relMs = Number.isFinite(relativeTime) ? relativeTime : 0;

        const data = parsed.data;
        const summary = summarizeEvent(category, name, data);
        const streamIds = collectStreamIds(data);

        rows[seq] = {
            seq,
            relMs,
            category,
            name,
            typeStr,
            summary,
            searchStr: `${typeStr} ${summary}`.toLowerCase(),
            streamIds,
        };

        categorySet.add(category);

        for (const streamId of streamIds) {
            let seqs = streamIndex.get(streamId);
            if (seqs === undefined) {
                seqs = [];
                streamIndex.set(streamId, seqs);
            }
            // seq increases monotonically, so per-stream lists stay ascending for free
            seqs.push(seq);
        }
    }

    return {
        rows,
        streamIndex,
        categories: Array.from(categorySet).sort(),
    };
}
