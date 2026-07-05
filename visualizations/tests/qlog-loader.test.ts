import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import FileLoader from "../src/components/filemanager/data/FileLoader";
import QlogConnection from "../src/data/Connection";
import QlogConnectionGroup from "../src/data/ConnectionGroup";
import { QlogLoader } from "../src/data/QlogLoader";
import * as qlog from "../src/data/QlogSchema";

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

function normalizedName(filePath: string): string {
    return path.basename(filePath).replace(/\.(gz|gzip)$/i, "");
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
}

// the draft-era .qlog.js standalone samples wrap their JSON in a `var x = {...};`
// JavaScript assignment: unwrap it here so the production FileLoader path (which only
// handles JSON) can parse them
function unwrapJavaScriptQlog(bytes: Uint8Array, name: string): { bytes: Uint8Array, name: string } {
    if (!name.endsWith(".js")) {
        return { bytes, name };
    }

    let text = new TextDecoder("utf-8").decode(bytes).trim();
    text = text.substring(text.indexOf("=") + 1).trim();
    if (text.endsWith(";")) {
        text = text.substring(0, text.length - 1).trim();
    }

    return {
        bytes: new TextEncoder().encode(text),
        name: name.substring(0, name.length - ".js".length),
    };
}

// production path: everything goes through FileLoader (extension/header sniff +
// per-format converters), exactly like a file drop in the UI
async function loadBytesThroughFileLoader(rawBytes: Uint8Array, rawName: string): Promise<QlogConnectionGroup> {
    const { bytes, name } = unwrapJavaScriptQlog(rawBytes, rawName);
    const file = new File([exactArrayBuffer(bytes)], name, { type: "application/qlog" });
    const result = await FileLoader.Load(file, name);
    expect(result.error).toBeUndefined();

    const group = QlogLoader.fromJSON(result.qlogJSON);
    expect(group).toBeTruthy();
    expect(group!.getConnections().length).toBeGreaterThan(0);

    const eventCount = totalEvents(group!);
    expect(eventCount).toBeGreaterThan(0);

    return group!;
}

async function loadThroughFileLoader(filePath: string): Promise<QlogConnectionGroup> {
    return loadBytesThroughFileLoader(readMaybeGzip(filePath), normalizedName(filePath));
}

function totalEvents(group: QlogConnectionGroup): number {
    return group.getConnections().reduce((sum, connection) => sum + connection.getEvents().length, 0);
}

// mirrors renderer usage (e.g. CongestionGraphD3Renderer): setupLookupTable() then lookup()
function lookupCount(connection: QlogConnection, category: qlog.EventCategory, eventType: qlog.EventType): number {
    connection.setupLookupTable();

    return connection.lookup(category, eventType).length;
}

describe("qvis qlog loader", () => {
    it.each([
        "aioquic/www.google.com.qlog.gz",
        "aioquic/fonts.gstatic.com.qlog.gz",
        "curl/cloudflare-quic.com-parallel.sqlog.gz",
        "curl/cloudflare-quic.com-serial.sqlog.gz",
        "quiche/quiche-localhost-client.sqlog.gz",
        "quiche/quiche-localhost-server.sqlog.gz",
    ])("loads waterfall-tools sample %s", async (relativePath) => {
        await loadThroughFileLoader(path.join(SAMPLE_QLOG_DIR, relativePath));
    });

    it.each([
        "draft-00/quictrace_example_github.qlog",
        "draft-01/doublevantage_100ms.qlog",
        "draft-01/new_cid.qlog",
        "draft-01/parallel_10_50KB_f5.qlog",
        "draft-01/spin_bit.qlog",
        "draft-00/example_github.qlog.js",
        "draft-01/new_cid.qlog.js",
        "draft-01/spin_bit.qlog.js",
    ])("loads upstream standalone_data draft sample %s", async (relativePath) => {
        await loadThroughFileLoader(path.join(STANDALONE_DIR, relativePath));
    });

    it("normalizes spec-final namespaces and RawInfo stream payload lengths", async () => {
        const group = await loadThroughFileLoader(path.join(SAMPLE_QLOG_DIR, "quiche/quiche-localhost-client.sqlog.gz"));
        const connection = group.getConnections()[0];
        let packetEventCount = 0;
        let streamFrame: any = null;

        for (const rawEvent of connection.getEvents()) {
            const event = connection.parseEvent(rawEvent);
            if (event.category !== "quic" || (event.name !== "packet_sent" && event.name !== "packet_received")) {
                continue;
            }
            packetEventCount++;

            for (const frame of event.data?.frames || []) {
                if (frame.frame_type === "stream" && frame.raw?.payload_length !== undefined) {
                    streamFrame = JSON.parse(JSON.stringify(frame));
                    break;
                }
            }
            if (streamFrame) {
                break;
            }
        }

        expect(packetEventCount).toBeGreaterThan(0);

        expect(streamFrame).toBeTruthy();
        expect(streamFrame.length).toBe(streamFrame.raw.payload_length);
    });

    it("handles spec-final object reference_time and relative_to_previous_event clocks", () => {
        const group = QlogLoader.fromJSON({
            file_schema: "urn:ietf:params:qlog:file:sequential",
            serialization_format: "JSON",
            traces: [{
                event_schemas: ["urn:ietf:params:qlog:events:quic"],
                vantage_point: { type: "client" },
                common_fields: {
                    reference_time: { epoch: 1700000000000 },
                    time_format: "relative_to_previous_event",
                },
                events: [
                    {
                        time: 5,
                        name: "transport:packet_sent",
                        data: {
                            frames: [{
                                frame_type: "STREAM",
                                id: "0",
                                raw: { payload_length: 12 },
                            }],
                        },
                    },
                    { time: 7, name: "recovery:metrics_updated", data: {} },
                    { time: 11, name: "http:frame_parsed", data: {} },
                ],
            }],
        });
        expect(group).toBeTruthy();

        const connection = group!.getConnections()[0];
        const events = connection.getEvents().map((rawEvent) => {
            const event = connection.parseEvent(rawEvent);
            return {
                absoluteTime: event.absoluteTime,
                relativeTime: event.relativeTime,
                category: event.category,
                name: event.name,
                data: JSON.parse(JSON.stringify(event.data)),
            };
        });

        expect(events.map(event => event.absoluteTime)).toEqual([
            1700000000005,
            1700000000012,
            1700000000023,
        ]);
        expect(events.map(event => event.relativeTime)).toEqual([5, 12, 23]);
        expect(events.map(event => `${event.category}:${event.name}`)).toEqual([
            "quic:packet_sent",
            "quic:recovery_metrics_updated",
            "http3:frame_parsed",
        ]);
        expect(events[0].data.frames[0].stream_id).toBe("0");
        expect(events[0].data.frames[0].length).toBe(12);
    });
});

// these mirror the exact queries the untouched D3 renderers issue
// (e.g. SequenceDiagramD3Renderer / CongestionGraphD3Renderer use
// lookup( qlog.EventCategory.recovery, qlog.RecoveryEventType.metrics_updated ))
describe("Connection.lookup contract", () => {
    it("finds recovery metrics_updated in a draft-era standalone file", async () => {
        const group = await loadThroughFileLoader(path.join(STANDALONE_DIR, "draft-01/parallel_10_50KB_f5.qlog"));
        const connection = group.getConnections()[0];

        expect(lookupCount(connection, qlog.EventCategory.recovery, qlog.RecoveryEventType.metrics_updated)).toBe(45);
    });

    it("finds recovery metrics_updated in a draft-era JSON-SEQ file (curl/ngtcp2)", async () => {
        const group = await loadThroughFileLoader(path.join(SAMPLE_QLOG_DIR, "curl/cloudflare-quic.com-serial.sqlog.gz"));
        const connection = group.getConnections()[0];

        expect(lookupCount(connection, qlog.EventCategory.recovery, qlog.RecoveryEventType.metrics_updated)).toBe(158);
    });

    it("finds recovery metrics_updated in the quiche spec-final client file", async () => {
        const group = await loadThroughFileLoader(path.join(SAMPLE_QLOG_DIR, "quiche/quiche-localhost-client.sqlog.gz"));
        const connection = group.getConnections()[0];

        expect(lookupCount(connection, qlog.EventCategory.recovery, qlog.RecoveryEventType.metrics_updated)).toBe(17);
    });

    it("finds spec-final congestion_state_updated via the recovery query", async () => {
        const clientGroup = await loadThroughFileLoader(path.join(SAMPLE_QLOG_DIR, "quiche/quiche-localhost-client.sqlog.gz"));
        const serverGroup = await loadThroughFileLoader(path.join(SAMPLE_QLOG_DIR, "quiche/quiche-localhost-server.sqlog.gz"));

        expect(lookupCount(clientGroup.getConnections()[0], qlog.EventCategory.recovery, qlog.RecoveryEventType.congestion_state_updated)).toBe(1);
        expect(lookupCount(serverGroup.getConnections()[0], qlog.EventCategory.recovery, qlog.RecoveryEventType.congestion_state_updated)).toBe(1);
    });

    it("files draft recovery:packet_lost and spec-final quic:packet_lost under the same key", () => {
        const group = QlogLoader.fromJSON({
            qlog_version: "0.3",
            qlog_format: "JSON",
            traces: [{
                vantage_point: { type: "client" },
                events: [
                    { time: 1, name: "recovery:packet_lost", data: {} },
                    { time: 2, name: "quic:packet_lost", data: {} },
                    { time: 3, name: "recovery:metrics_updated", data: {} },
                    { time: 4, name: "quic:recovery_metrics_updated", data: {} },
                    { time: 5, name: "recovery:congestion_state_updated", data: {} },
                    { time: 6, name: "quic:congestion_state_updated", data: {} },
                ],
            }],
        });
        expect(group).toBeTruthy();

        const connection = group!.getConnections()[0];

        expect(lookupCount(connection, qlog.EventCategory.recovery, qlog.RecoveryEventType.packet_lost)).toBe(2);
        expect(lookupCount(connection, qlog.EventCategory.recovery, qlog.RecoveryEventType.metrics_updated)).toBe(2);
        expect(lookupCount(connection, qlog.EventCategory.recovery, qlog.RecoveryEventType.congestion_state_updated)).toBe(2);
    });

    it("keeps recovery parameters_set out of the transport parameters_set bucket", () => {
        // the recovery→quic namespace fold must not merge two different event shapes:
        // draft recovery:parameters_set becomes quic:recovery_parameters_set (spec-final
        // spelling), never quic:parameters_set (which is transport parameters).
        const group = QlogLoader.fromJSON({
            qlog_version: "0.3",
            qlog_format: "JSON",
            traces: [{
                vantage_point: { type: "client" },
                events: [
                    { time: 1, name: "transport:parameters_set", data: {} },
                    { time: 2, name: "recovery:parameters_set", data: {} },
                    { time: 3, name: "quic:recovery_parameters_set", data: {} },
                ],
            }],
        });
        expect(group).toBeTruthy();

        const connection = group!.getConnections()[0];

        expect(lookupCount(connection, qlog.EventCategory.transport, qlog.TransportEventType.parameters_set)).toBe(1);
        expect(lookupCount(connection, qlog.EventCategory.recovery, qlog.RecoveryEventType.parameters_set)).toBe(2);
    });
});

describe("concatenated JSON-SEQ", () => {
    it("splits a concatenated sqlog stream into one trace per header record", async () => {
        const clientBytes = readMaybeGzip(path.join(SAMPLE_QLOG_DIR, "quiche/quiche-localhost-client.sqlog.gz"));
        const serverBytes = readMaybeGzip(path.join(SAMPLE_QLOG_DIR, "quiche/quiche-localhost-server.sqlog.gz"));

        const clientEvents = totalEvents(await loadBytesThroughFileLoader(clientBytes, "quiche-localhost-client.sqlog"));
        const serverEvents = totalEvents(await loadBytesThroughFileLoader(serverBytes, "quiche-localhost-server.sqlog"));

        // concatenated JSON-SEQ logs are legal: every header record starts a fresh trace
        const concatenated = new Uint8Array(clientBytes.byteLength + serverBytes.byteLength);
        concatenated.set(clientBytes, 0);
        concatenated.set(serverBytes, clientBytes.byteLength);

        const group = await loadBytesThroughFileLoader(concatenated, "quiche-concatenated.sqlog");
        const connections = group.getConnections();

        expect(connections.length).toBe(2);
        expect(connections[0].vantagePoint.type).toBe(qlog.VantagePointType.client);
        expect(connections[1].vantagePoint.type).toBe(qlog.VantagePointType.server);
        expect(connections[0].getEvents().length).toBe(clientEvents);
        expect(connections[1].getEvents().length).toBe(serverEvents);
    });
});
