// Pure per-event-type summary formatters for the Events tab.
// Framework-independent: no Vue imports, plain strings out (no HTML — qlog field
// values are attacker-controlled and the consumer renders via text interpolation).
//
// HARD RULE: formatters never throw on missing/malformed/wrong-typed fields.
// Every field access is guarded and every formatter degrades to a partial (or
// empty) summary; summarizeEvent additionally wraps dispatch in a try/catch as a
// last-resort safety net.

import { normalizeEventPair } from "@/data/QlogSupport";

const SUMMARY_SEPARATOR = " · "; // " · "

function isRecord(value: unknown): value is Record<string, any> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScalar(value: unknown): value is string | number | boolean | bigint {
    const type = typeof value;
    return type === "string" || type === "number" || type === "boolean" || type === "bigint";
}

function finiteNumber(value: unknown): number | undefined {
    if (value === undefined || value === null || value === "") {
        return undefined;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
}

function scalarString(value: unknown): string | undefined {
    return isScalar(value) ? String(value) : undefined;
}

// draft-0.3 STREAM frames carry the data length directly (frame.length); spec-final
// producers nest a RawInfo where payload_length is the stream data and length includes
// frame headers. Resolution order: length → raw.payload_length → raw.length, with zero
// treated as a real value (no || chains).
function frameLength(frame: any): number | undefined {
    if (!isRecord(frame)) {
        return undefined;
    }
    const direct = finiteNumber(frame.length);
    if (direct !== undefined) {
        return direct;
    }
    if (isRecord(frame.raw)) {
        const payload = finiteNumber(frame.raw.payload_length);
        if (payload !== undefined) {
            return payload;
        }
        return finiteNumber(frame.raw.length);
    }
    return undefined;
}

function formatBytes(length: number | undefined): string | undefined {
    return length === undefined ? undefined : `${length}B`;
}

// --- HTTP header helpers (byte-form tolerant) -------------------------------------
// Spec-final producers may log headers as hex byte strings (name_bytes/value_bytes)
// instead of plain name/value — mirror the core parser's decode-and-prefer-plain rule.

function decodeHexString(value: unknown): string {
    if (typeof value !== "string") {
        return "";
    }
    const hex = value.replace(/\s+/g, "");
    if (hex.length === 0 || hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) {
        return "";
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    try {
        return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    } catch {
        return "";
    }
}

function headerName(header: any): string {
    if (!isRecord(header)) {
        return "";
    }
    if (typeof header.name === "string") {
        return header.name;
    }
    return decodeHexString(header.name_bytes);
}

function headerValue(header: any): string {
    if (!isRecord(header)) {
        return "";
    }
    if (isScalar(header.value)) {
        return String(header.value);
    }
    return decodeHexString(header.value_bytes);
}

function findHeader(headers: any, wanted: string): string | undefined {
    if (!Array.isArray(headers)) {
        return undefined;
    }
    for (const header of headers) {
        if (headerName(header).toLowerCase() === wanted) {
            return headerValue(header);
        }
    }
    return undefined;
}

// --- k=v helpers -------------------------------------------------------------------

function kvPairs(data: any, keys: readonly string[]): string[] {
    const parts: string[] = [];
    if (!isRecord(data)) {
        return parts;
    }
    for (const key of keys) {
        if (isScalar(data[key])) {
            parts.push(`${key}=${String(data[key])}`);
        }
    }
    return parts;
}

function allScalarPairs(data: any, limit: number): string[] {
    const parts: string[] = [];
    if (!isRecord(data)) {
        return parts;
    }
    for (const key of Object.keys(data)) {
        if (!isScalar(data[key])) {
            continue;
        }
        parts.push(`${key}=${String(data[key])}`);
        if (parts.length >= limit) {
            break;
        }
    }
    return parts;
}

// --- packet events -----------------------------------------------------------------

function packetType(data: any): string | undefined {
    // normalizeEventData moves a top-level packet_type into header, but formatters
    // must tolerate raw (un-normalized) shapes too
    const header = isRecord(data) ? data.header : undefined;
    const raw = scalarString(isRecord(header) ? header.packet_type : undefined)
        ?? scalarString(isRecord(data) ? data.packet_type : undefined);
    if (raw === undefined) {
        return undefined;
    }
    // canonical casing for the short-RTT spellings; leave initial/handshake/... alone
    return /^[01]rtt$/i.test(raw) ? raw.toUpperCase() : raw;
}

function packetHead(data: any): string {
    const parts: string[] = [];
    const type = packetType(data);
    if (type !== undefined) {
        parts.push(type);
    }
    const header = isRecord(data) ? data.header : undefined;
    const packetNumber = finiteNumber(isRecord(header) ? header.packet_number : undefined);
    if (packetNumber !== undefined) {
        parts.push(`#${packetNumber}`);
    }
    return parts.join(" ");
}

function summarizeStreamFrame(frame: Record<string, any>): string {
    const inner: string[] = [];
    const streamId = scalarString(frame.stream_id) ?? scalarString(frame.id);
    if (streamId !== undefined) {
        inner.push(streamId);
    }
    const bytes = formatBytes(frameLength(frame));
    if (bytes !== undefined) {
        inner.push(bytes);
    }
    if (frame.fin === true) {
        inner.push("fin");
    }
    return `STREAM(${inner.join(", ")})`;
}

// frame-type roll-up: STREAM frames listed individually (stream id + length matter),
// every other frame type collapsed to one compact uppercase name in first-seen order
function summarizeFrames(frames: any): string {
    if (!Array.isArray(frames)) {
        return "";
    }
    const parts: string[] = [];
    const seenTypes = new Set<string>();
    for (const frame of frames) {
        if (!isRecord(frame)) {
            continue;
        }
        const frameType = typeof frame.frame_type === "string" ? frame.frame_type.toLowerCase() : "";
        if (frameType === "stream") {
            parts.push(summarizeStreamFrame(frame));
            continue;
        }
        if (frameType.length === 0 || seenTypes.has(frameType)) {
            continue;
        }
        seenTypes.add(frameType);
        parts.push(frameType.toUpperCase());
    }
    return parts.join(", ");
}

function summarizePacket(data: any): string {
    const parts: string[] = [];
    const head = packetHead(data);
    if (head.length > 0) {
        parts.push(head);
    }
    const frames = summarizeFrames(isRecord(data) ? data.frames : undefined);
    if (frames.length > 0) {
        parts.push(frames);
    }
    return parts.join(SUMMARY_SEPARATOR);
}

function summarizePacketDropped(data: any): string {
    const parts: string[] = [];
    const head = packetHead(data);
    if (head.length > 0) {
        parts.push(head);
    }
    if (isRecord(data)) {
        const size = formatBytes(isRecord(data.raw) ? finiteNumber(data.raw.length) : undefined);
        if (size !== undefined) {
            parts.push(size);
        }
        parts.push(...kvPairs(data, ["trigger"]));
    }
    return parts.join(SUMMARY_SEPARATOR);
}

// --- stream data movement ----------------------------------------------------------

function summarizeStreamDataMoved(data: any): string {
    if (!isRecord(data)) {
        return "";
    }
    const parts: string[] = [];
    const streamId = scalarString(data.stream_id);
    if (streamId !== undefined) {
        parts.push(`stream ${streamId}`);
    }
    const offset = finiteNumber(data.offset);
    if (offset !== undefined) {
        parts.push(`off ${offset}`);
    }
    // spec field is data.length; quiche nests the byte count in a RawInfo instead
    const bytes = formatBytes(frameLength(data));
    if (bytes !== undefined) {
        parts.push(bytes);
    }
    const from = scalarString(data.from);
    const to = scalarString(data.to);
    if (from !== undefined || to !== undefined) {
        parts.push(`${from ?? "?"}→${to ?? "?"}`);
    }
    return parts.join(SUMMARY_SEPARATOR);
}

// --- http3 frames ------------------------------------------------------------------

function summarizeH3Frame(data: any): string {
    if (!isRecord(data)) {
        return "";
    }
    const parts: string[] = [];
    const streamId = scalarString(data.stream_id);
    if (streamId !== undefined) {
        parts.push(`stream ${streamId}`);
    }

    const frame = isRecord(data.frame) ? data.frame : undefined;
    const frameType = frame && typeof frame.frame_type === "string" ? frame.frame_type.toLowerCase() : "";
    if (frameType.length > 0) {
        parts.push(frameType.toUpperCase());
    }

    if (frameType === "headers" && frame) {
        const method = findHeader(frame.headers, ":method");
        const pathValue = findHeader(frame.headers, ":path");
        const status = findHeader(frame.headers, ":status");
        if (method !== undefined) {
            parts.push(pathValue !== undefined ? `${method} ${pathValue}` : method);
        }
        else if (status !== undefined) {
            parts.push(status);
        }
    }
    else if (frameType === "data") {
        // frame-level length (draft) → frame RawInfo → event-level length (quiche
        // logs the frame byte count as data.length) → event-level RawInfo
        const bytes = formatBytes(frameLength(frame) ?? frameLength(data));
        if (bytes !== undefined) {
            parts.push(bytes);
        }
    }

    return parts.join(SUMMARY_SEPARATOR);
}

// --- recovery metrics --------------------------------------------------------------

function summarizeMetrics(data: any): string {
    // every scalar in data is a metric sample (nested vendor objects like quiche's
    // cf_lost_bytes {total, delta} are intentionally skipped)
    if (!isRecord(data)) {
        return "";
    }
    const parts: string[] = [];
    for (const key of Object.keys(data)) {
        if (isScalar(data[key])) {
            parts.push(`${key}=${String(data[key])}`);
        }
    }
    return parts.join(" ");
}

// --- connectivity ------------------------------------------------------------------

function formatHostPort(ip: unknown, port: unknown): string | undefined {
    const host = scalarString(ip);
    if (host === undefined) {
        return undefined;
    }
    const portStr = scalarString(port);
    const bracketed = host.includes(":") ? `[${host}]` : host;
    return portStr !== undefined ? `${bracketed}:${portStr}` : bracketed;
}

// spec-final PathEndpointInfo: {ip_v4, port_v4, ip_v6, port_v6} (IPv4 preferred)
function formatPathEndpoint(endpoint: any): string | undefined {
    if (!isRecord(endpoint)) {
        return undefined;
    }
    return formatHostPort(endpoint.ip_v4, endpoint.port_v4)
        ?? formatHostPort(endpoint.ip_v6, endpoint.port_v6);
}

function summarizeConnectionStarted(data: any): string {
    if (!isRecord(data)) {
        return "";
    }
    const src = formatHostPort(data.src_ip, data.src_port) ?? formatPathEndpoint(data.local);
    const dst = formatHostPort(data.dst_ip, data.dst_port) ?? formatPathEndpoint(data.remote);
    const parts: string[] = [];
    if (src !== undefined || dst !== undefined) {
        parts.push(`${src ?? "?"} → ${dst ?? "?"}`);
    }
    parts.push(...kvPairs(data, ["protocol"]));
    return parts.join(SUMMARY_SEPARATOR);
}

function summarizeConnectionStateUpdated(data: any): string {
    if (!isRecord(data)) {
        return "";
    }
    const newState = scalarString(data.new) ?? scalarString(data.state);
    const oldState = scalarString(data.old);
    if (newState === undefined) {
        return "";
    }
    return oldState !== undefined ? `${oldState} → ${newState}` : `state=${newState}`;
}

function summarizeConnectionClosed(data: any): string {
    return kvPairs(data, [
        "owner",
        "connection_code",
        "application_code",
        "internal_code",
        "error",
        "error_code",
        "reason",
        "trigger",
    ]).join(" ");
}

function summarizePathAssigned(data: any): string {
    if (!isRecord(data)) {
        return "";
    }
    const parts: string[] = [];
    const pathId = scalarString(data.path_id);
    if (pathId !== undefined) {
        parts.push(`path ${pathId}`);
    }
    const local = formatPathEndpoint(data.path_local);
    const remote = formatPathEndpoint(data.path_remote);
    if (local !== undefined || remote !== undefined) {
        parts.push(`${local ?? "?"} → ${remote ?? "?"}`);
    }
    return parts.join(SUMMARY_SEPARATOR);
}

// --- transport parameters ----------------------------------------------------------

function summarizeParametersSet(data: any): string {
    if (!isRecord(data)) {
        return "";
    }
    const parts: string[] = [];
    // owner (draft) / initiator (spec-final) says whose parameters these are
    parts.push(...kvPairs(data, ["owner", "initiator"]));
    const alpn = scalarString(data.chosen_alpn) ?? scalarString(data.alpn);
    if (alpn !== undefined) {
        parts.push(`alpn=${alpn}`);
    }
    const cipher = scalarString(data.tls_cipher) ?? scalarString(data.cipher);
    if (cipher !== undefined) {
        parts.push(`cipher=${cipher}`);
    }
    parts.push(...kvPairs(data, ["max_idle_timeout", "initial_max_data", "initial_max_streams_bidi"]));
    return parts.join(" ");
}

// --- generic fallback ---------------------------------------------------------------

const GENERIC_SCALAR_LIMIT = 4;

function summarizeGeneric(data: any): string {
    return allScalarPairs(data, GENERIC_SCALAR_LIMIT).join(" ");
}

// --- dispatch ------------------------------------------------------------------------

type SummaryFormatter = (data: any) => string;

const FORMATTERS: ReadonlyMap<string, SummaryFormatter> = new Map<string, SummaryFormatter>([
    ["quic:packet_sent", summarizePacket],
    ["quic:packet_received", summarizePacket],
    ["quic:packet_dropped", summarizePacketDropped],
    ["quic:stream_data_moved", summarizeStreamDataMoved],
    ["http3:frame_created", summarizeH3Frame],
    ["http3:frame_parsed", summarizeH3Frame],
    ["quic:recovery_metrics_updated", summarizeMetrics],
    ["quic:parameters_set", summarizeParametersSet],
    // connectivity events appear under both the connectivity: and quic: namespaces
    // depending on the producer era (mirrors the core waterfall-tools qlog parser)
    ["connectivity:connection_started", summarizeConnectionStarted],
    ["quic:connection_started", summarizeConnectionStarted],
    ["connectivity:connection_state_updated", summarizeConnectionStateUpdated],
    ["quic:connection_state_updated", summarizeConnectionStateUpdated],
    ["connectivity:connection_closed", summarizeConnectionClosed],
    ["quic:connection_closed", summarizeConnectionClosed],
    ["connectivity:path_assigned", summarizePathAssigned],
    ["quic:path_assigned", summarizePathAssigned],
]);

// Produce a one-line plain-text summary for an event. category/name may be any qlog
// era's spelling — they are canonicalized through the same normalizeEventPair used by
// the loaders, so callers that already pass canonical values pay only an idempotent
// re-normalization.
export function summarizeEvent(category: string, name: string, data: any): string {
    try {
        const normalized = normalizeEventPair(category, name);
        const formatter = FORMATTERS.get(`${normalized.category}:${normalized.name}`);
        if (formatter !== undefined) {
            const summary = formatter(data);
            if (summary.length > 0) {
                return summary;
            }
            // a per-type formatter that found nothing usable still degrades to the
            // generic scalar dump rather than an information-free empty cell
        }
        return summarizeGeneric(data);
    } catch {
        // hard rule: never throw on malformed input — degrade to an empty summary
        return "";
    }
}
