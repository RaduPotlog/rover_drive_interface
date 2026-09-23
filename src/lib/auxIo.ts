// General-purpose aux IO on the safety PLC (Portenta DIO00..DIO11), as published by
// rover_hardware_interface on hardware_interface/aux_io_state. Not part of the safety chain.
import type { Level } from "./status";
import type { Header, Time } from "./rosTypes";

export const AUX_COUNT = 6;

/** Aux data older than this (by browser arrival time) is treated as missing. It publishes at 20 Hz. */
export const AUX_STALE_MS = 3000;

/** How long the PLC read-back may lag a successful switch before the row calls it a mismatch. */
export const AUX_READBACK_GRACE_MS = 1000;

export interface AuxIoStateMsg {
    header: Header;
    io_sample_time: Time;
    // Fixed-size bool[6]: the CDR reader may hand these over as a typed or plain array.
    inputs: ArrayLike<boolean | number>;
    outputs: ArrayLike<boolean | number>;
    link_healthy: boolean;
}

export interface AuxIoSummary {
    level: Level;
    /** Short chip text. */
    value: string;
    detail: string;
    /** Whether switching outputs makes sense right now. */
    canWrite: boolean;
    /** Why not, when canWrite is false. */
    reason: string;
    /** PLC read-back per output, or null without usable data. */
    outputs: boolean[] | null;
    inputs: boolean[] | null;
}

const toBools = (values: ArrayLike<boolean | number> | undefined): boolean[] | null => {
    if (!values || values.length < AUX_COUNT) return null;
    return Array.from(values).slice(0, AUX_COUNT).map(Boolean);
};

export const summarizeAuxIo = (
    msg: AuxIoStateMsg | null,
    receivedAt: number | null,
    now: number,
    connected = true,
): AuxIoSummary => {
    const none = (level: Level, detail: string, reason: string): AuxIoSummary =>
        ({ level, value: "—", detail, canWrite: false, reason, outputs: null, inputs: null });

    if (!connected) return none("unknown", "Not connected to the rover", "Not connected");
    if (!msg || receivedAt === null) {
        return none("unknown", "No aux_io_state from the rover (simulation, or hardware interface not running)",
            "No aux IO data");
    }
    if (now - receivedAt >= AUX_STALE_MS) {
        return none("unknown", "aux_io_state stopped arriving", "Aux IO data is stale");
    }

    const outputs = toBools(msg.outputs);
    const inputs = toBools(msg.inputs);
    if (!outputs || !inputs) return none("unknown", "aux_io_state has unexpected array sizes", "Malformed aux IO data");

    const onCount = outputs.filter(Boolean).length;
    const value = `${onCount} on`;

    if (!msg.link_healthy) {
        return {
            level: "warn",
            value,
            detail: "PLC link down - values are the last read and may be stale",
            canWrite: false,
            reason: "PLC link down",
            outputs,
            inputs,
        };
    }

    return {
        level: "ok",
        value,
        detail: `${onCount} of ${AUX_COUNT} outputs on, ${inputs.filter(Boolean).length} of ${AUX_COUNT} inputs active`,
        canWrite: true,
        reason: "",
        outputs,
        inputs,
    };
};

/** An output switch in flight, or recently acknowledged, for one row. */
export interface AuxRequest {
    requested: boolean;
    /** Set while the service call is outstanding. */
    busy: boolean;
    /** When the service answered success=true; null while busy or after a failure. */
    ackedAt: number | null;
}

/** "unknown": no usable read-back (stale or no data) - never shown as OFF. */
export type AuxRowState = "on" | "off" | "unknown" | "pending" | "mismatch";

/**
 * What an output row shows. The PLC read-back is the truth; a request only overrides it while the
 * call is in flight or within the read-back grace window, after which a disagreement is flagged.
 */
export const auxRowState = (readBack: boolean | null, request: AuxRequest | null, now: number): AuxRowState => {
    if (request?.busy) return "pending";
    if (readBack === null) return "unknown";
    if (request && request.ackedAt !== null && readBack !== request.requested) {
        return now - request.ackedAt < AUX_READBACK_GRACE_MS ? "pending" : "mismatch";
    }
    return readBack ? "on" : "off";
};

/** An acknowledged request is done with once the PLC reads back what was asked for. */
export const auxRequestSettled = (readBack: boolean | null, request: AuxRequest | null) =>
    request !== null && !request.busy && request.ackedAt !== null && readBack === request.requested;

/**
 * Operator-facing names from a comma-separated config string: always exactly `count` entries, a
 * blank or missing entry falls back to "<prefix> <n>", extras are ignored.
 */
export const parseAuxNames = (raw: unknown, count: number, fallbackPrefix: string): string[] => {
    const given = typeof raw === "string" ? raw.split(",").map((name) => name.trim()) : [];
    return Array.from({ length: count }, (_, i) => given[i] || `${fallbackPrefix} ${i + 1}`);
};

/** PLC pin label: outputs are DIO00..05, inputs DIO06..11. */
export const auxPin = (kind: "output" | "input", index: number) =>
    `DIO${String((kind === "output" ? 0 : AUX_COUNT) + index).padStart(2, "0")}`;
