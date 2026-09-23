import { describe, expect, it } from "vitest";

import { parseConfig } from "../src/config";
import {
    AUX_READBACK_GRACE_MS,
    AUX_STALE_MS,
    type AuxIoStateMsg,
    auxPin,
    auxRequestSettled,
    auxRowState,
    parseAuxNames,
    summarizeAuxIo,
} from "../src/lib/auxIo";

const stamp = { sec: 0, nanosec: 0 };
const msg = (over: Partial<AuxIoStateMsg> = {}): AuxIoStateMsg => ({
    header: { stamp, frame_id: "" },
    io_sample_time: stamp,
    inputs: [true, false, false, false, false, true],
    outputs: [true, true, false, false, false, false],
    link_healthy: true,
    ...over,
});

describe("summarizeAuxIo", () => {
    it("reports fresh, healthy data as ok and writable", () => {
        const s = summarizeAuxIo(msg(), 1000, 1500);
        expect(s.level).toBe("ok");
        expect(s.value).toBe("2 on");
        expect(s.canWrite).toBe(true);
        expect(s.outputs).toEqual([true, true, false, false, false, false]);
        expect(s.inputs).toEqual([true, false, false, false, false, true]);
    });

    it("keeps showing the last values but blocks writes when the PLC link is down", () => {
        const s = summarizeAuxIo(msg({ link_healthy: false }), 1000, 1500);
        expect(s.level).toBe("warn");
        expect(s.value).toBe("2 on");
        expect(s.canWrite).toBe(false);
        expect(s.reason).toMatch(/link down/i);
        expect(s.outputs).not.toBeNull();
    });

    it("treats stale data as missing", () => {
        const s = summarizeAuxIo(msg(), 1000, 1000 + AUX_STALE_MS);
        expect(s.level).toBe("unknown");
        expect(s.value).toBe("—");
        expect(s.canWrite).toBe(false);
        expect(s.outputs).toBeNull();
        expect(s.inputs).toBeNull();
    });

    it("has nothing to show with no message or no connection", () => {
        expect(summarizeAuxIo(null, null, 0).canWrite).toBe(false);
        expect(summarizeAuxIo(null, null, 0).level).toBe("unknown");
        const offline = summarizeAuxIo(msg(), 1000, 1500, false);
        expect(offline.canWrite).toBe(false);
        expect(offline.reason).toBe("Not connected");
    });

    it("accepts the fixed-size arrays as typed arrays and rejects short ones", () => {
        const typed = summarizeAuxIo(msg({ outputs: new Uint8Array([1, 0, 0, 0, 0, 1]) }), 1000, 1500);
        expect(typed.outputs).toEqual([true, false, false, false, false, true]);
        expect(typed.value).toBe("2 on");

        const short = summarizeAuxIo(msg({ inputs: [true, false] }), 1000, 1500);
        expect(short.canWrite).toBe(false);
        expect(short.inputs).toBeNull();
    });
});

describe("auxRowState", () => {
    it("follows the PLC read-back when idle", () => {
        expect(auxRowState(true, null, 0)).toBe("on");
        expect(auxRowState(false, null, 0)).toBe("off");
    });

    it("never shows a missing read-back as OFF, nor as a mismatch", () => {
        expect(auxRowState(null, null, 0)).toBe("unknown");
        expect(auxRowState(null, { requested: true, busy: false, ackedAt: 0 }, 5000)).toBe("unknown");
        expect(auxRowState(null, { requested: true, busy: true, ackedAt: null }, 0)).toBe("pending");
    });

    it("settles a request once the PLC reads back what was asked for", () => {
        const acked = { requested: true, busy: false, ackedAt: 1000 };
        expect(auxRequestSettled(true, acked)).toBe(true);
        expect(auxRequestSettled(false, acked)).toBe(false);
        expect(auxRequestSettled(null, acked)).toBe(false);
        expect(auxRequestSettled(true, { requested: true, busy: true, ackedAt: null })).toBe(false);
        expect(auxRequestSettled(true, null)).toBe(false);
    });

    it("is pending while the call is in flight", () => {
        expect(auxRowState(false, { requested: true, busy: true, ackedAt: null }, 0)).toBe("pending");
    });

    it("gives the read-back a grace window after a successful switch, then flags a mismatch", () => {
        const req = { requested: true, busy: false, ackedAt: 1000 };
        expect(auxRowState(false, req, 1000 + AUX_READBACK_GRACE_MS - 1)).toBe("pending");
        expect(auxRowState(false, req, 1000 + AUX_READBACK_GRACE_MS)).toBe("mismatch");
        expect(auxRowState(true, req, 5000)).toBe("on");
    });
});

describe("aux names", () => {
    it("always yields six names, falling back per blank or missing entry", () => {
        expect(parseAuxNames("", 6, "Output")).toEqual(
            ["Output 1", "Output 2", "Output 3", "Output 4", "Output 5", "Output 6"]);
        expect(parseAuxNames(" Beacon , ,Tool power", 6, "Output")).toEqual(
            ["Beacon", "Output 2", "Tool power", "Output 4", "Output 5", "Output 6"]);
        expect(parseAuxNames("a,b,c,d,e,f,g,h", 6, "Input")).toEqual(["a", "b", "c", "d", "e", "f"]);
        expect(parseAuxNames(42, 6, "Input")[0]).toBe("Input 1");
    });

    it("comes through config.json", () => {
        const config = parseConfig({ auxOutputNames: "Beacon,Horn", auxInputNames: undefined });
        expect(config.auxOutputNames.slice(0, 3)).toEqual(["Beacon", "Horn", "Output 3"]);
        expect(config.auxInputNames).toHaveLength(6);
        expect(parseConfig({}).auxOutputNames[5]).toBe("Output 6");
    });

    it("labels the PLC pins DIO00..05 for outputs and DIO06..11 for inputs", () => {
        expect(auxPin("output", 0)).toBe("DIO00");
        expect(auxPin("output", 5)).toBe("DIO05");
        expect(auxPin("input", 0)).toBe("DIO06");
        expect(auxPin("input", 5)).toBe("DIO11");
    });
});
