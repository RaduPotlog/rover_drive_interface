/*
 * diagnostics_agg -> the shape the Diagnostics popup renders.
 *
 * The tree building, the leaf filtering and the level ladder are ported from
 * RaduPotlog/rover_cockpit_ros2_diagnostics (`src/components/RosConnectionManager.tsx`,
 * `src/components/DiagnosticsTable.tsx`, `src/components/DiagnosticsTreeTable.tsx`,
 * `src/hooks/useDiagHistory.ts`), a fork of clearpathrobotics/cockpit-ros2-diagnostics.
 * That code is LGPL-2.1-or-later, so this file is too - see `src/ros/COPYING.LESSER`.
 * The rest of this repository is Apache-2.0.
 *
 * Kept deliberately free of React: the Docker build runs `npm test` under plain node, and
 * the level -> icon mapping is a render concern (upstream bakes a JSX icon into every entry;
 * here `DiagnosticsLevelIcon` does it at render time).
 */
import type { Header } from "./rosTypes";
import type { Level } from "./status";

// ------------------------------------------------------------------ wire types

export interface DiagnosticKeyValue { key: string; value: string }

/** diagnostic_msgs/DiagnosticStatus. Wire names (snake_case) - do not camelCase these. */
export interface DiagnosticStatusMsg {
    name: string;
    message: string;
    level: number;
    hardware_id?: string;
    values?: DiagnosticKeyValue[];
}

export interface DiagnosticArrayMsg { header?: Header; status: DiagnosticStatusMsg[] }

// ------------------------------------------------------------------ app types

/** One node of the diagnostics tree. `level` is -1 for a node the aggregator never publishes. */
export interface DiagnosticsEntry {
    /** Display name: the part after ":" on a leaf, else the path segment. */
    name: string;
    /** Full slash path with any ":" suffix stripped, e.g. "/Rover/GPS/GPS fix". */
    path: string;
    /** Identity across refreshes: the original status name on a leaf, the path on a branch. */
    rawName: string;
    message: string;
    level: number;
    hardwareId: string | null;
    values: Record<string, string>;
    children: DiagnosticsEntry[];
}

export interface DiagnosticsSnapshot {
    /** Milliseconds, from the message header when it has one. */
    timestamp: number;
    /** Worst level anywhere in the tree. */
    level: number;
    tree: DiagnosticsEntry[];
}

// ------------------------------------------------------------------ levels

const OK = 0;
const WARN = 1;
const ERROR = 2;
const STALE = 3;

/** DiagnosticStatus level -> the word the detail pane shows. */
export const levelName = (level: number): string =>
    level === STALE ? "STALE" : level === ERROR ? "ERROR" : level === WARN ? "WARNING" : "OK";

/** DiagnosticStatus level -> the UI level union, for colour classes. */
export const levelToLevel = (level: number): Level =>
    level === OK ? "ok"
        : level === WARN ? "warn"
            : level === ERROR ? "error"
                : level === STALE ? "stale" : "unknown";

/**
 * Timeline step colour. Note this is NOT `worstDiagnosticLevel` from ./status: the pill ranks
 * STALE between WARN and ERROR for the operator, while the Cockpit page - which this popup
 * mirrors - folds STALE in with ERROR (`level >= 2`). Both rules are intentional; keep them apart.
 */
export const timelineLevel = (level: number): "ok" | "warn" | "error" =>
    level >= ERROR ? "error" : level === WARN ? "warn" : "ok";

// ------------------------------------------------------------------ tree building

const valuesToObject = (values: DiagnosticKeyValue[] | undefined): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const { key, value } of values ?? []) out[key] = String(value);
    return out;
};

/**
 * Build the nested tree from a flat DiagnosticArray. Status names are slash paths
 * ("/Rover/GPS/GPS fix"); the aggregator also publishes the group nodes ("/Rover/GPS"), so
 * most branches carry a real level. A branch no status names keeps level -1.
 */
export const buildDiagnosticsTree = (statuses: DiagnosticStatusMsg[]): DiagnosticsEntry[] => {
    const root: DiagnosticsEntry[] = [];

    for (const status of statuses) {
        const parts = status.name.split("/");
        let level = root;

        parts.forEach((part, index) => {
            if (!part) return; // leading "" from the absolute path

            let entry = level.find((e) => e.name === part);
            if (!entry) {
                const [baseName, suffix] = part.split(":");
                const path = parts.slice(0, index + 1).join("/").split(":")[0];
                const last = index === parts.length - 1;
                entry = {
                    name: last && suffix ? suffix : baseName,
                    path,
                    rawName: path,
                    message: "",
                    level: -1,
                    hardwareId: null,
                    values: {},
                    children: [],
                };
                level.push(entry);
            }

            if (index === parts.length - 1) {
                entry.message = status.message || "";
                entry.level = status.level ?? -1;
                entry.hardwareId = status.hardware_id || null;
                entry.rawName = status.name;
                entry.values = valuesToObject(status.values);
            }

            level = entry.children;
        });
    }

    return root;
};

/** Worst level anywhere in the tree; -1 branches never win. */
export const overallLevel = (entries: DiagnosticsEntry[]): number => {
    let worst = 0;
    const visit = (entry: DiagnosticsEntry) => {
        if (entry.level > worst) worst = entry.level;
        entry.children.forEach(visit);
    };
    entries.forEach(visit);
    return worst;
};

/** Depth-first list of the childless nodes - the actual diagnostic tasks. */
export const collectLeafNodes = (entries: DiagnosticsEntry[]): DiagnosticsEntry[] =>
    entries.flatMap((entry) => (entry.children.length === 0 ? [entry] : collectLeafNodes(entry.children)));

/** Leaves for one card. "error" takes level >= 2, so STALE lands in Errors (as in Cockpit). */
export const leafIssues = (entries: DiagnosticsEntry[], variant: "error" | "warning"): DiagnosticsEntry[] =>
    collectLeafNodes(entries).filter((e) => (variant === "error" ? e.level >= ERROR : e.level === WARN));

export const findEntryByRawName = (entries: DiagnosticsEntry[], rawName: string): DiagnosticsEntry | null => {
    for (const entry of entries) {
        if (entry.rawName === rawName) return entry;
        const found = findEntryByRawName(entry.children, rawName);
        if (found) return found;
    }
    return null;
};

/** The rawNames from a root down to `rawName`, so the tree can expand every ancestor. */
export const findPathToRawName = (
    entries: DiagnosticsEntry[],
    rawName: string,
    path: string[] = [],
): string[] | null => {
    for (const entry of entries) {
        const next = [...path, entry.rawName];
        if (entry.rawName === rawName) return next;
        const child = findPathToRawName(entry.children, rawName, next);
        if (child) return child;
    }
    return null;
};

// ------------------------------------------------------------------ snapshots & history

/** ROS time -> epoch milliseconds, falling back when the bridge gave us no header. */
export const stampToMillis = (header: Header | undefined, fallbackMs: number): number => {
    const stamp = header?.stamp;
    if (!stamp) return fallbackMs;
    return stamp.sec * 1000 + Math.round((stamp.nanosec ?? 0) / 1e6);
};

export const snapshotFromMessage = (message: DiagnosticArrayMsg, nowMs: number): DiagnosticsSnapshot => {
    const tree = buildDiagnosticsTree(message.status ?? []);
    return { timestamp: stampToMillis(message.header, nowMs), level: overallLevel(tree), tree };
};

/** How many snapshots the timeline holds. At the aggregator's 1 Hz this is ~30 s. */
export const HISTORY_SIZE = 30;

/** Append, capped at HISTORY_SIZE. An empty snapshot is ignored and the array kept identical. */
export const pushSnapshot = (
    history: DiagnosticsSnapshot[],
    snapshot: DiagnosticsSnapshot,
): DiagnosticsSnapshot[] => {
    if (snapshot.tree.length === 0) return history;
    const next = [...history, snapshot];
    return next.length > HISTORY_SIZE ? next.slice(-HISTORY_SIZE) : next;
};

export type TimelineSlot =
    | { kind: "blank" }
    | { kind: "snapshot"; index: number; level: "ok" | "warn" | "error"; selected: boolean };

/**
 * The timeline is always HISTORY_SIZE wide: blanks first, then the snapshots, so the strip
 * fills from the right and does not reflow as history grows. `negIndex` counts back from the
 * newest (-1 = latest), which keeps the selection stable while entries fall off the front.
 */
export const timelineSlots = (history: DiagnosticsSnapshot[], negIndex: number): TimelineSlot[] => {
    const blanks = Math.max(0, HISTORY_SIZE - history.length);
    const selected = history.length + negIndex;
    return [
        ...Array.from({ length: blanks }, (): TimelineSlot => ({ kind: "blank" })),
        ...history.map((snapshot, index): TimelineSlot => ({
            kind: "snapshot",
            index,
            level: timelineLevel(snapshot.level),
            selected: index === selected,
        })),
    ];
};
