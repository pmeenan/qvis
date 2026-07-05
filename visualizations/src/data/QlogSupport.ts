const NAMESPACE_RENAMES: Record<string, string> = {
    transport: "quic",
    http: "http3",
    // spec-final folded the draft-era recovery category into the quic namespace
    // (draft recovery:packet_lost === spec-final quic:packet_lost, etc.)
    recovery: "quic",
};

// spec-final rename inside the old recovery category that doesn't follow the plain
// namespace move: metrics_updated gained a recovery_ prefix when it moved into quic:
// (mirrors the explicit dual-spelling handling in waterfall-tools' reference qlog parser)
const RECOVERY_EVENT_RENAMES: Record<string, string> = {
    metrics_updated: "recovery_metrics_updated",
    // same recovery_ prefix move in spec-final; without it the recovery→quic fold would
    // collide draft recovery:parameters_set into transport:parameters_set's bucket
    // (both would normalize to quic:parameters_set — two different event shapes)
    parameters_set: "recovery_parameters_set",
};

const QLOG_URN_PREFIX = "urn:ietf:params:qlog";

export interface QlogNameParts {
    category: string;
    name: string;
}

export function isQlogUrn(value: unknown): boolean {
    return typeof value === "string" && value.startsWith(QLOG_URN_PREFIX);
}

export function hasSpecFinalQlogIdentity(json: any): boolean {
    if (!json || typeof json !== "object") {
        return false;
    }

    if (isQlogUrn(json.file_schema)) {
        return true;
    }

    if (Array.isArray(json.event_schemas) && json.event_schemas.some(isQlogUrn)) {
        return true;
    }

    const trace = json.trace;
    if (trace && Array.isArray(trace.event_schemas) && trace.event_schemas.some(isQlogUrn)) {
        return true;
    }

    if (Array.isArray(json.traces)) {
        return json.traces.some((candidate: any) => {
            return candidate && Array.isArray(candidate.event_schemas) && candidate.event_schemas.some(isQlogUrn);
        });
    }

    return false;
}

export function getQlogVersionIdentifier(json: any): string {
    if (!json || typeof json !== "object") {
        return "";
    }

    if (typeof json.qlog_version === "string") {
        return json.qlog_version;
    }

    if (isQlogUrn(json.file_schema)) {
        return json.file_schema;
    }

    if (Array.isArray(json.event_schemas)) {
        const eventSchema = json.event_schemas.find(isQlogUrn);
        if (eventSchema) {
            return eventSchema;
        }
    }

    if (json.trace && Array.isArray(json.trace.event_schemas)) {
        const eventSchema = json.trace.event_schemas.find(isQlogUrn);
        if (eventSchema) {
            return eventSchema;
        }
    }

    if (Array.isArray(json.traces)) {
        for (const trace of json.traces) {
            if (trace && Array.isArray(trace.event_schemas)) {
                const eventSchema = trace.event_schemas.find(isQlogUrn);
                if (eventSchema) {
                    return eventSchema;
                }
            }
        }
    }

    return "";
}

export function normalizeEventName(rawName: unknown): string {
    if (typeof rawName !== "string") {
        return "";
    }

    const name = rawName.trim();
    const separatorIndex = name.search(/[:.]/);
    if (separatorIndex < 0) {
        return name.toLowerCase();
    }

    const rawNamespace = name.substring(0, separatorIndex).toLowerCase();
    let rawEventName = name.substring(separatorIndex + 1).replace(/\./g, "_").toLowerCase();

    if (rawNamespace === "recovery") {
        rawEventName = RECOVERY_EVENT_RENAMES[rawEventName] || rawEventName;
    }

    const namespace = NAMESPACE_RENAMES[rawNamespace] || rawNamespace;
    return `${namespace}:${rawEventName}`;
}

export function splitEventName(rawName: unknown): QlogNameParts {
    const name = normalizeEventName(rawName);
    const separatorIndex = name.indexOf(":");
    if (separatorIndex < 0) {
        return {
            category: "unknown",
            name,
        };
    }

    return {
        category: name.substring(0, separatorIndex),
        name: name.substring(separatorIndex + 1),
    };
}

// Canonicalize a (category, eventType) pair through the exact same rename tables as
// normalizeEventName, so producers (lookup-table build) and consumers (lookup queries)
// always agree on the same key no matter which qlog era spelled the input.
export function normalizeEventPair(rawCategory: unknown, rawName: unknown): QlogNameParts {
    const name = typeof rawName === "string" ? rawName.trim() : "";

    // a fully namespaced name (e.g. "quic:packet_lost") carries its own category
    if (name.search(/[:.]/) >= 0) {
        return splitEventName(name);
    }

    const category = typeof rawCategory === "string" ? rawCategory.trim().toLowerCase() : "";
    if (category.length === 0) {
        return {
            category: "unknown",
            name: name.toLowerCase(),
        };
    }

    return splitEventName(`${category}:${name}`);
}

export function normalizeCategory(rawCategory: unknown, rawName?: unknown): string {
    const category = typeof rawCategory === "string" ? rawCategory.trim().toLowerCase() : "";
    if (category.length === 0) {
        return "";
    }

    return normalizeEventPair(category, rawName).category;
}

export function normalizeEventType(rawCategory: unknown, rawName: unknown): string {
    if (typeof rawName !== "string") {
        return "";
    }

    return normalizeEventPair(rawCategory, rawName).name;
}

function firstFiniteNumber(...values: unknown[]): number | undefined {
    for (const value of values) {
        if (value === undefined || value === null) {
            continue;
        }

        const numberValue = Number(value);
        if (Number.isFinite(numberValue)) {
            return numberValue;
        }
    }

    return undefined;
}

export function normalizeEventData(data: any): void {
    if (!data || typeof data !== "object") {
        return;
    }

    if (data.header && typeof data.header === "object") {
        if (Object.prototype.hasOwnProperty.call(data.header, "packet_size")) {
            data.raw = data.raw || {};
            data.raw.length = data.header.packet_size;
            delete data.header.packet_size;
        }

        if (Object.prototype.hasOwnProperty.call(data.header, "payload_length")) {
            data.raw = data.raw || {};
            data.raw.payload_length = data.header.payload_length;
            delete data.header.payload_length;
        }
    }

    if (typeof data.packet_type === "string") {
        data.header = data.header || {};
        data.header.packet_type = data.packet_type;
        delete data.packet_type;
    }

    const frames = Array.isArray(data.frames) ? data.frames : undefined;
    if (!frames) {
        return;
    }

    for (const frame of frames) {
        if (!frame || typeof frame !== "object") {
            continue;
        }

        if (typeof frame.frame_type === "string") {
            frame.frame_type = frame.frame_type.toLowerCase();
        }

        if (frame.id !== undefined && frame.stream_id === undefined) {
            frame.stream_id = frame.id;
            delete frame.id;
        }

        if (frame.frame_type !== "stream") {
            continue;
        }

        if (frame.length !== undefined && frame.length !== null) {
            continue;
        }

        const raw = frame.raw || {};
        const length = firstFiniteNumber(raw.payload_length, raw.length);
        if (length !== undefined) {
            frame.length = length;
        }
    }
}

export function parseReferenceTime(referenceTime: unknown, multiplier: number): number {
    const parsed = parseReferenceTimeValue(referenceTime, multiplier);
    return parsed === undefined ? 0 : parsed;
}

function parseReferenceTimeValue(referenceTime: unknown, multiplier: number): number | undefined {
    if (referenceTime === undefined || referenceTime === null) {
        return undefined;
    }

    if (typeof referenceTime === "object") {
        const ref = referenceTime as Record<string, unknown>;
        if (ref.epoch !== undefined && ref.epoch !== null && ref.epoch !== "unknown") {
            const epoch = parseReferenceScalar(ref.epoch, multiplier);
            if (epoch !== undefined) {
                return epoch;
            }
        }

        if (ref.wall_clock_time !== undefined && ref.wall_clock_time !== "unknown") {
            return parseReferenceScalar(ref.wall_clock_time, multiplier);
        }

        return undefined;
    }

    return parseReferenceScalar(referenceTime, multiplier);
}

function parseReferenceScalar(referenceTime: unknown, multiplier: number): number | undefined {
    if (typeof referenceTime === "number") {
        return Number.isFinite(referenceTime) ? referenceTime : undefined;
    }

    if (typeof referenceTime !== "string") {
        return undefined;
    }

    const numeric = Number(referenceTime);
    if (Number.isFinite(numeric)) {
        return numeric;
    }

    const parsedDate = Date.parse(referenceTime);
    if (!Number.isFinite(parsedDate)) {
        return undefined;
    }

    return multiplier === 1 ? parsedDate : parsedDate / multiplier;
}

