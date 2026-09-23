import { describe, expect, it } from "vitest";

import {
    buildDiagnosticsTree,
    collectLeafNodes,
    type DiagnosticsSnapshot,
    type DiagnosticStatusMsg,
    findEntryByRawName,
    findPathToRawName,
    HISTORY_SIZE,
    leafIssues,
    levelName,
    levelToLevel,
    overallLevel,
    pushSnapshot,
    snapshotFromMessage,
    stampToMillis,
    timelineLevel,
    timelineSlots,
} from "../src/lib/diagnostics";

const status = (
    name: string,
    level: number,
    extra: Partial<DiagnosticStatusMsg> = {},
): DiagnosticStatusMsg => ({ name, level, message: `${name} message`, ...extra });

// The shape rover_diag_manager's aggregator actually publishes: a "Rover" root, one node per
// analyzer group, and the diagnostic_updater task as the leaf.
const STATUSES: DiagnosticStatusMsg[] = [
    status("/Rover", 1),
    status("/Rover/GPS", 1),
    status("/Rover/GPS/GPS fix", 1, { hardware_id: "gps0", values: [{ key: "fix", value: "2D" }] }),
    status("/Rover/GPS/Heading alignment", 1),
    status("/Rover/Lidar", 0),
    status("/Rover/Lidar/Scan rate", 0),
];

describe("buildDiagnosticsTree", () => {
    it("nests statuses by their slash path", () => {
        const tree = buildDiagnosticsTree(STATUSES);

        expect(tree).toHaveLength(1);
        expect(tree[0].name).toBe("Rover");
        expect(tree[0].children.map((c) => c.name)).toEqual(["GPS", "Lidar"]);

        const gps = tree[0].children[0];
        expect(gps.children.map((c) => c.name)).toEqual(["GPS fix", "Heading alignment"]);
        expect(gps.children[0].path).toBe("/Rover/GPS/GPS fix");
        expect(gps.children[0].rawName).toBe("/Rover/GPS/GPS fix");
        expect(gps.children[0].hardwareId).toBe("gps0");
        expect(gps.children[0].values).toEqual({ fix: "2D" });
    });

    it("uses the part after ':' as the leaf name and strips it from the path", () => {
        const tree = buildDiagnosticsTree([status("/Rover/Battery: Battery status", 0)]);
        const leaf = tree[0].children[0];

        expect(leaf.name).toBe(" Battery status");
        expect(leaf.path).toBe("/Rover/Battery");
        // rawName keeps the original so the entry stays identifiable across refreshes.
        expect(leaf.rawName).toBe("/Rover/Battery: Battery status");
    });

    it("gives branches the aggregator publishes a real level and the others -1", () => {
        // "/Rover/Motion" is never published as a status here, only its leaf.
        const tree = buildDiagnosticsTree([status("/Rover", 0), status("/Rover/Motion/Motion lock", 1)]);

        expect(tree[0].level).toBe(0);
        expect(tree[0].children[0].name).toBe("Motion");
        expect(tree[0].children[0].level).toBe(-1);
        expect(tree[0].children[0].children[0].level).toBe(1);
    });

    it("defaults values to an empty object and skips empty name parts", () => {
        const tree = buildDiagnosticsTree([status("/Rover//Odd", 0)]);

        expect(tree[0].children[0].name).toBe("Odd");
        expect(tree[0].children[0].values).toEqual({});
    });
});

describe("levels", () => {
    it("returns the worst level anywhere in the tree", () => {
        expect(overallLevel(buildDiagnosticsTree(STATUSES))).toBe(1);
        expect(overallLevel(buildDiagnosticsTree([status("/Rover/X", 3)]))).toBe(3);
        expect(overallLevel([])).toBe(0);
    });

    it("names levels the way the detail pane shows them", () => {
        expect([0, 1, 2, 3, -1].map(levelName)).toEqual(["OK", "WARNING", "ERROR", "STALE", "OK"]);
    });

    it("maps levels to the UI level union", () => {
        expect([0, 1, 2, 3, -1].map(levelToLevel)).toEqual(["ok", "warn", "error", "stale", "unknown"]);
    });

    it("folds STALE in with ERROR for the timeline, unlike the top-bar pill", () => {
        expect([0, 1, 2, 3].map(timelineLevel)).toEqual(["ok", "warn", "error", "error"]);
    });
});

describe("leaf selection", () => {
    const tree = buildDiagnosticsTree(STATUSES);

    it("collects only the childless nodes", () => {
        expect(collectLeafNodes(tree).map((e) => e.name))
            .toEqual(["GPS fix", "Heading alignment", "Scan rate"]);
    });

    it("splits warnings from errors, with STALE counted as an error", () => {
        const mixed = buildDiagnosticsTree([
            status("/Rover/A/warn", 1),
            status("/Rover/A/error", 2),
            status("/Rover/A/stale", 3),
            status("/Rover/A/ok", 0),
        ]);

        expect(leafIssues(mixed, "warning").map((e) => e.name)).toEqual(["warn"]);
        expect(leafIssues(mixed, "error").map((e) => e.name)).toEqual(["error", "stale"]);
    });

    it("never returns a branch", () => {
        expect(leafIssues(tree, "warning").map((e) => e.name)).toEqual(["GPS fix", "Heading alignment"]);
    });
});

describe("lookup", () => {
    const tree = buildDiagnosticsTree(STATUSES);

    it("finds an entry by rawName", () => {
        expect(findEntryByRawName(tree, "/Rover/GPS/GPS fix")?.name).toBe("GPS fix");
        expect(findEntryByRawName(tree, "/nope")).toBeNull();
    });

    it("returns the ancestor chain so the tree can expand it", () => {
        expect(findPathToRawName(tree, "/Rover/GPS/GPS fix"))
            .toEqual(["/Rover", "/Rover/GPS", "/Rover/GPS/GPS fix"]);
        expect(findPathToRawName(tree, "/nope")).toBeNull();
    });
});

describe("snapshots", () => {
    it("converts the ROS stamp to milliseconds", () => {
        expect(stampToMillis({ stamp: { sec: 100, nanosec: 500_000_000 }, frame_id: "" }, 7)).toBe(100_500);
    });

    it("falls back when the bridge gave us no header", () => {
        expect(stampToMillis(undefined, 1234)).toBe(1234);
    });

    it("builds a snapshot with tree, worst level and timestamp", () => {
        const snap = snapshotFromMessage({ status: STATUSES }, 42);
        expect(snap.timestamp).toBe(42);
        expect(snap.level).toBe(1);
        expect(snap.tree[0].name).toBe("Rover");
    });
});

describe("history", () => {
    const snap = (timestamp: number): DiagnosticsSnapshot =>
        ({ timestamp, level: 0, tree: buildDiagnosticsTree([status("/Rover", 0)]) });

    it("caps at HISTORY_SIZE keeping the newest", () => {
        let history: DiagnosticsSnapshot[] = [];
        for (let i = 0; i < HISTORY_SIZE + 5; i += 1) history = pushSnapshot(history, snap(i));

        expect(history).toHaveLength(HISTORY_SIZE);
        expect(history[0].timestamp).toBe(5);
        expect(history[HISTORY_SIZE - 1].timestamp).toBe(HISTORY_SIZE + 4);
    });

    it("ignores an empty snapshot without churning the array", () => {
        const history = [snap(1)];
        expect(pushSnapshot(history, { timestamp: 2, level: 0, tree: [] })).toBe(history);
    });

    it("does not mutate its input", () => {
        const history = [snap(1)];
        pushSnapshot(history, snap(2));
        expect(history).toHaveLength(1);
    });
});

describe("timelineSlots", () => {
    const history = [0, 1, 2, 3].map((t) => ({ timestamp: t, level: t, tree: [{}] } as unknown as DiagnosticsSnapshot));

    it("is always HISTORY_SIZE wide, padded with blanks on the left", () => {
        const slots = timelineSlots(history, -1);
        expect(slots).toHaveLength(HISTORY_SIZE);
        expect(slots.slice(0, HISTORY_SIZE - 4).every((s) => s.kind === "blank")).toBe(true);
        expect(slots[HISTORY_SIZE - 4]).toMatchObject({ kind: "snapshot", index: 0, level: "ok" });
    });

    it("selects from the end, so the selection survives entries falling off the front", () => {
        expect(timelineSlots(history, -1).at(-1)).toMatchObject({ index: 3, selected: true });
        expect(timelineSlots(history, -4)[HISTORY_SIZE - 4]).toMatchObject({ index: 0, selected: true });
    });

    it("selects nothing when there is no history", () => {
        expect(timelineSlots([], -1).every((s) => s.kind === "blank")).toBe(true);
    });
});
