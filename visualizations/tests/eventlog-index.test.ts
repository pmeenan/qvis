import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import FileLoader from "../src/components/filemanager/data/FileLoader";
import { getEventLogIndex } from "../src/components/eventlog/data/EventLogIndex";
import { summarizeEvent } from "../src/components/eventlog/data/EventSummaries";
import QlogConnection from "../src/data/Connection";
import QlogConnectionGroup from "../src/data/ConnectionGroup";
import { QlogLoader } from "../src/data/QlogLoader";

const ROOT = path.resolve(process.cwd(), "../../..");
const SAMPLE_QLOG_DIR = path.join(ROOT, "Sample/Data/qlog");
const STANDALONE_DIR = path.resolve(process.cwd(), "public/standalone_data");

function readMaybeGzip(filePath: string): Uint8Array {
    const bytes = fs.readFileSync(filePath);
    if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
        return zlib.gunzipSync(bytes);
    }
    return bytes;
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
}

// production path: FileLoader sniff/convert + QlogLoader, exactly like a file drop
async function loadConnection(filePath: string): Promise<QlogConnection> {
    const bytes = readMaybeGzip(filePath);
    const name = path.basename(filePath).replace(/\.(gz|gzip)$/i, "");
    const file = new File([exactArrayBuffer(bytes)], name, { type: "application/qlog" });
    const result = await FileLoader.Load(file, name);
    expect(result.error).toBeUndefined();

    const group: QlogConnectionGroup | undefined = QlogLoader.fromJSON(result.qlogJSON) ?? undefined;
    expect(group).toBeTruthy();
    const connection = group!.getConnections()[0];
    expect(connection.getEvents().length).toBeGreaterThan(0);

    return connection;
}

function hex(text: string): string {
    return Buffer.from(text, "utf-8").toString("hex");
}

// one draft-era file per flavor (plain-JSON aioquic + flat-array standalone) and the
// spec-final quiche captures from both vantage points
const CORPUS = [
    { label: "aioquic draft client (rich mode)", file: path.join(SAMPLE_QLOG_DIR, "aioquic/www.google.com.qlog.gz") },
    { label: "standalone draft-01 flat-array", file: path.join(STANDALONE_DIR, "draft-01/parallel_10_50KB_f5.qlog") },
    { label: "quiche spec-final client", file: path.join(SAMPLE_QLOG_DIR, "quiche/quiche-localhost-client.sqlog.gz") },
    { label: "quiche spec-final server", file: path.join(SAMPLE_QLOG_DIR, "quiche/quiche-localhost-server.sqlog.gz") },
];

describe("event log index", () => {
    it.each(CORPUS)("builds a complete, well-formed index for $label", async ({ file }) => {
        const connection = await loadConnection(file);
        const index = getEventLogIndex(connection);

        // one row per raw event, keyed by array index
        expect(index.rows.length).toBe(connection.getEvents().length);
        expect(index.rows.length).toBeGreaterThan(0);

        let previousRelMs = -Infinity;
        for (const row of index.rows) {
            expect(row.seq).toBe(index.rows.indexOf(row));

            // relMs finite, non-negative, and non-decreasing (all corpus files are
            // chronologically ordered)
            expect(Number.isFinite(row.relMs)).toBe(true);
            expect(row.relMs).toBeGreaterThanOrEqual(0);
            expect(row.relMs).toBeGreaterThanOrEqual(previousRelMs);
            previousRelMs = row.relMs;

            expect(row.typeStr).toBe(`${row.category}:${row.name}`);
            expect(typeof row.summary).toBe("string");
            expect(row.searchStr).toBe(`${row.typeStr} ${row.summary}`.toLowerCase());

            // stream ids are always strings
            for (const streamId of row.streamIds) {
                expect(typeof streamId).toBe("string");
            }
        }

        // categories: sorted unique canonical categories actually present
        expect(index.categories.length).toBeGreaterThan(0);
        expect(index.categories).toEqual(Array.from(new Set(index.rows.map((row) => row.category))).sort());
    });

    it.each(CORPUS)("uses canonical spec-final spellings for $label", async ({ file }) => {
        const connection = await loadConnection(file);
        const index = getEventLogIndex(connection);

        // no draft-era namespaces may survive normalization
        for (const row of index.rows) {
            expect(row.typeStr.startsWith("transport:")).toBe(false);
            expect(row.typeStr.startsWith("http:")).toBe(false);
            expect(row.typeStr.startsWith("recovery:")).toBe(false);
            expect(row.typeStr).not.toBe("quic:metrics_updated");
        }

        const typeStrs = new Set(index.rows.map((row) => row.typeStr));
        // every corpus member logs packet events and recovery metrics; the draft files
        // spell them transport:packet_sent / recovery:metrics_updated on the wire
        expect(typeStrs.has("quic:packet_sent") || typeStrs.has("quic:packet_received")).toBe(true);
        expect(typeStrs.has("quic:recovery_metrics_updated")).toBe(true);
    });

    it.each(CORPUS)("indexes streams with multi-membership for $label", async ({ file }) => {
        const connection = await loadConnection(file);
        const index = getEventLogIndex(connection);

        // the expected client-initiated bidirectional stream ids are present
        for (const clientBidi of ["0", "4", "8"]) {
            expect(index.streamIndex.has(clientBidi)).toBe(true);
            expect(index.streamIndex.get(clientBidi)!.length).toBeGreaterThan(0);
        }

        // full bidirectional consistency: every row's streamIds appear in streamIndex
        // pointing back at that seq...
        for (const row of index.rows) {
            for (const streamId of row.streamIds) {
                expect(index.streamIndex.get(streamId)).toContain(row.seq);
            }
        }
        // ...and every streamIndex entry is ascending and points at rows that claim
        // membership of that stream
        for (const [streamId, seqs] of index.streamIndex) {
            let previousSeq = -1;
            for (const seq of seqs) {
                expect(seq).toBeGreaterThan(previousSeq);
                previousSeq = seq;
                expect(index.rows[seq].streamIds).toContain(streamId);
            }
        }

        // at least one packet event carrying STREAM frames appears in a stream's list
        const packetWithStream = index.rows.find((row) =>
            (row.name === "packet_sent" || row.name === "packet_received") && row.streamIds.length > 0);
        expect(packetWithStream).toBeTruthy();
        for (const streamId of packetWithStream!.streamIds) {
            expect(index.streamIndex.get(streamId)).toContain(packetWithStream!.seq);
        }
    });

    // the quiche exchange is strictly sequential (never two streams in one packet), so
    // the concrete multi-stream fixture assertions run against the corpora that do
    // coalesce frames: aioquic (parallel requests) and the draft-01 parallel download
    it.each([
        { label: "aioquic draft client", file: path.join(SAMPLE_QLOG_DIR, "aioquic/www.google.com.qlog.gz") },
        { label: "standalone draft-01 flat-array", file: path.join(STANDALONE_DIR, "draft-01/parallel_10_50KB_f5.qlog") },
    ])("finds a packet carrying frames for multiple streams in $label", async ({ file }) => {
        const connection = await loadConnection(file);
        const index = getEventLogIndex(connection);

        const multiStreamPacket = index.rows.find((row) =>
            (row.name === "packet_sent" || row.name === "packet_received") && row.streamIds.length >= 2);
        expect(multiStreamPacket).toBeTruthy();

        // the one packet appears under every stream it carried frames for
        for (const streamId of multiStreamPacket!.streamIds) {
            expect(index.streamIndex.get(streamId)).toContain(multiStreamPacket!.seq);
        }
    });

    it("returns the identical cached index object on repeated calls", async () => {
        const connection = await loadConnection(path.join(SAMPLE_QLOG_DIR, "quiche/quiche-localhost-client.sqlog.gz"));

        const first = getEventLogIndex(connection);
        const second = getEventLogIndex(connection);
        expect(second).toBe(first);
        expect(second.rows).toBe(first.rows);
        expect(second.streamIndex).toBe(first.streamIndex);
    });

    it("never mutates the connection's events", async () => {
        const connection = await loadConnection(path.join(SAMPLE_QLOG_DIR, "quiche/quiche-localhost-client.sqlog.gz"));
        const before = JSON.parse(JSON.stringify(connection.getEvents()));

        getEventLogIndex(connection);

        expect(JSON.parse(JSON.stringify(connection.getEvents()))).toEqual(before);
    });

    it.each(CORPUS)("produces non-empty summaries for packet events in $label", async ({ file }) => {
        const connection = await loadConnection(file);
        const index = getEventLogIndex(connection);

        const packetRows = index.rows.filter((row) => row.name === "packet_sent" || row.name === "packet_received");
        expect(packetRows.length).toBeGreaterThan(0);
        for (const row of packetRows) {
            expect(row.summary.length).toBeGreaterThan(0);
        }
    });
});

describe("summarizeEvent formatters", () => {
    it("summarizes packets with draft-era direct STREAM frame lengths", () => {
        const summary = summarizeEvent("transport", "packet_sent", {
            header: { packet_type: "1RTT", packet_number: 1234 },
            frames: [
                { frame_type: "stream", stream_id: 0, length: 12000 },
                { frame_type: "ack" },
            ],
        });
        expect(summary).toBe("1RTT #1234 · STREAM(0, 12000B), ACK");
    });

    it("summarizes packets with spec-final RawInfo STREAM frame lengths identically", () => {
        const summary = summarizeEvent("quic", "packet_sent", {
            header: { packet_type: "1RTT", packet_number: 1234 },
            frames: [
                { frame_type: "stream", stream_id: 0, raw: { payload_length: 12000 } },
                { frame_type: "ack" },
            ],
        });
        expect(summary).toBe("1RTT #1234 · STREAM(0, 12000B), ACK");
    });

    it("treats a zero STREAM frame length as a real value (no || fallback)", () => {
        const summary = summarizeEvent("quic", "packet_received", {
            header: { packet_type: "initial", packet_number: 0 },
            frames: [{ frame_type: "stream", stream_id: 4, length: 0, raw: { payload_length: 999 } }],
        });
        expect(summary).toBe("initial #0 · STREAM(4, 0B)");
    });

    it("falls back through raw.payload_length to raw.length", () => {
        const summary = summarizeEvent("quic", "packet_sent", {
            header: { packet_type: "handshake", packet_number: 2 },
            frames: [{ frame_type: "stream", stream_id: 8, raw: { length: 55 } }],
        });
        expect(summary).toBe("handshake #2 · STREAM(8, 55B)");
    });

    it("marks fin STREAM frames and rolls up repeated non-stream frame types", () => {
        const summary = summarizeEvent("quic", "packet_sent", {
            header: { packet_type: "1rtt", packet_number: 9 },
            frames: [
                { frame_type: "padding" },
                { frame_type: "stream", stream_id: "0", length: 10, fin: true },
                { frame_type: "padding" },
                { frame_type: "ack" },
            ],
        });
        expect(summary).toBe("1RTT #9 · PADDING, STREAM(0, 10B, fin), ACK");
    });

    it("summarizes dropped packets with size and trigger", () => {
        const summary = summarizeEvent("quic", "packet_dropped", {
            header: { packet_type: "initial" },
            raw: { length: 1200 },
            trigger: "key_unavailable",
        });
        expect(summary).toBe("initial · 1200B · trigger=key_unavailable");
    });

    it("summarizes stream_data_moved in draft shape (direct length)", () => {
        const summary = summarizeEvent("quic", "stream_data_moved", {
            stream_id: 2, offset: 1, length: 18, from: "application", to: "transport",
        });
        expect(summary).toBe("stream 2 · off 1 · 18B · application→transport");
    });

    it("summarizes stream_data_moved in quiche shape (RawInfo length)", () => {
        const summary = summarizeEvent("quic", "stream_data_moved", {
            stream_id: 2, offset: 1, from: "application", to: "transport", raw: { length: 18 },
        });
        expect(summary).toBe("stream 2 · off 1 · 18B · application→transport");
    });

    it("summarizes http3 HEADERS requests from plain name/value headers", () => {
        const summary = summarizeEvent("http3", "frame_created", {
            stream_id: 0,
            frame: {
                frame_type: "headers",
                headers: [
                    { name: ":method", value: "GET" },
                    { name: ":scheme", value: "https" },
                    { name: ":path", value: "/index.html" },
                ],
            },
        });
        expect(summary).toBe("stream 0 · HEADERS · GET /index.html");
    });

    it("summarizes http3 HEADERS from byte-form name_bytes/value_bytes headers", () => {
        const summary = summarizeEvent("http3", "frame_parsed", {
            stream_id: 0,
            frame: {
                frame_type: "headers",
                headers: [
                    { name_bytes: hex(":method"), value_bytes: hex("GET") },
                    { name_bytes: hex(":path"), value_bytes: hex("/index.html") },
                ],
            },
        });
        expect(summary).toBe("stream 0 · HEADERS · GET /index.html");
    });

    it("summarizes http3 response HEADERS via :status", () => {
        const summary = summarizeEvent("http", "frame_parsed", {
            stream_id: 0,
            frame: {
                frame_type: "headers",
                headers: [{ name: ":status", value: "200" }],
            },
        });
        expect(summary).toBe("stream 0 · HEADERS · 200");
    });

    it("summarizes http3 DATA frames by byte length", () => {
        // quiche logs the frame byte count at the event level (data.length)
        const summary = summarizeEvent("http3", "frame_parsed", {
            stream_id: 0, length: 1024, frame: { frame_type: "data" },
        });
        expect(summary).toBe("stream 0 · DATA · 1024B");
    });

    it("summarizes recovery metrics as k=v pairs for both era spellings", () => {
        const data = { min_rtt: 333, smoothed_rtt: 333.5, congestion_window: 13500, cf_lost_bytes: { total: 0, delta: 0 } };
        const draft = summarizeEvent("recovery", "metrics_updated", data);
        const specFinal = summarizeEvent("quic", "recovery_metrics_updated", data);

        expect(draft).toBe("min_rtt=333 smoothed_rtt=333.5 congestion_window=13500");
        expect(specFinal).toBe(draft);
    });

    it("summarizes connectivity events", () => {
        expect(summarizeEvent("connectivity", "connection_started", {
            src_ip: "10.0.0.1", src_port: 4433, dst_ip: "10.0.0.2", dst_port: 443,
        })).toBe("10.0.0.1:4433 → 10.0.0.2:443");

        expect(summarizeEvent("connectivity", "connection_state_updated", { old: "handshake", new: "confirmed" }))
            .toBe("handshake → confirmed");
        expect(summarizeEvent("quic", "connection_state_updated", { new: "closed" }))
            .toBe("state=closed");

        expect(summarizeEvent("connectivity", "connection_closed", {
            owner: "remote", application_code: 256, reason: "done",
        })).toBe("owner=remote application_code=256 reason=done");

        expect(summarizeEvent("quic", "path_assigned", {
            path_id: "0",
            path_local: { ip_v4: "192.168.1.5", port_v4: 50000 },
            path_remote: { ip_v6: "2001:db8::1", port_v6: 443 },
        })).toBe("path 0 · 192.168.1.5:50000 → [2001:db8::1]:443");
    });

    it("summarizes parameters_set with initiator, ALPN, cipher, and key transport params", () => {
        const summary = summarizeEvent("transport", "parameters_set", {
            initiator: "remote",
            chosen_alpn: "h3",
            tls_cipher: "AES128_GCM",
            max_idle_timeout: 30000,
            initial_max_data: 10000000,
            initial_max_streams_bidi: 100,
            unknown_parameters: [],
        });
        expect(summary).toBe("initiator=remote alpn=h3 cipher=AES128_GCM max_idle_timeout=30000 initial_max_data=10000000 initial_max_streams_bidi=100");
    });

    it("falls back to generic scalar k=v pairs for unmapped event types", () => {
        const summary = summarizeEvent("quic", "congestion_state_updated", { new: "slow_start" });
        expect(summary).toBe("new=slow_start");
    });

    it("never throws on missing or malformed data", () => {
        const malformedCases: Array<[string, string, any]> = [
            ["quic", "packet_sent", undefined],
            ["quic", "packet_sent", null],
            ["quic", "packet_sent", "not an object"],
            ["quic", "packet_sent", { frames: 42 }],                       // frames not an array
            ["quic", "packet_sent", { frames: [null, "x", { frame_type: 7 }] }],
            ["quic", "packet_received", { header: "garbage" }],            // header not an object
            ["quic", "packet_dropped", {}],                                // header missing entirely
            ["quic", "stream_data_moved", { offset: "not-a-number" }],
            ["http3", "frame_parsed", { frame: "garbage" }],
            ["http3", "frame_created", { frame: { frame_type: "headers", headers: "garbage" } }],
            ["http3", "frame_created", { frame: { frame_type: "headers", headers: [null, { name_bytes: "zz" }] } }],
            ["quic", "recovery_metrics_updated", []],
            ["connectivity", "connection_started", { src_ip: {} }],
            ["connectivity", "path_assigned", { path_local: "garbage" }],
            ["quic", "parameters_set", 12345],
            ["", "", undefined],
            ["unknown_category", "unknown_event", { a: 1 }],
        ];

        for (const [category, name, data] of malformedCases) {
            const summary = summarizeEvent(category, name, data);
            expect(typeof summary).toBe("string");
        }
    });
});
