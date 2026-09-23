import { describe, expect, it } from "vitest";

import { quaternionFromYaw } from "../src/lib/geometry";
import { TfBuffer, type TransformStamped } from "../src/lib/tf";
import { nextViewFrameMode, resolveViewFrame } from "../src/lib/viewFrame";

const tf = (parent: string, child: string, x = 0, y = 0): TransformStamped => ({
    header: { frame_id: parent },
    child_frame_id: child,
    transform: { translation: { x, y, z: 0 }, rotation: quaternionFromYaw(0) },
});

const odomOnly = () => {
    const buf = new TfBuffer();
    buf.add([tf("rover/odom", "rover/base_footprint", 1, 2), tf("rover/base_footprint", "rover/base_link")]);
    return buf;
};

describe("resolveViewFrame", () => {
    it("auto uses the map frame when the rover is localized", () => {
        const buf = odomOnly();
        buf.add([tf("rover/map", "rover/odom", 5, 0)]);
        expect(resolveViewFrame("auto", buf, "/rover")).toEqual({ frame: "rover/map", kind: "map" });
    });

    it("auto falls back to odom when there is no map -> odom", () => {
        expect(resolveViewFrame("auto", odomOnly(), "/rover")).toEqual({ frame: "rover/odom", kind: "odom" });
    });

    it("auto stays on the map frame when nothing resolves", () => {
        expect(resolveViewFrame("auto", new TfBuffer(), "/rover")).toEqual({ frame: "rover/map", kind: "map" });
    });

    it("uses the map's own frame id when one arrived", () => {
        const buf = odomOnly();
        buf.add([tf("rover/slam_map", "rover/odom")]);
        expect(resolveViewFrame("auto", buf, "/rover", "rover/slam_map").frame).toBe("rover/slam_map");
    });

    it("honours the forced modes", () => {
        const buf = odomOnly();
        buf.add([tf("rover/map", "rover/odom")]);
        expect(resolveViewFrame("odom", buf, "/rover").kind).toBe("odom");
        expect(resolveViewFrame("map", odomOnly(), "/rover").kind).toBe("map");
    });

    it("works without a namespace", () => {
        const buf = new TfBuffer();
        buf.add([tf("odom", "base_link")]);
        expect(resolveViewFrame("auto", buf, "")).toEqual({ frame: "odom", kind: "odom" });
    });

    it("cycles auto -> map -> odom -> auto", () => {
        expect(nextViewFrameMode("auto")).toBe("map");
        expect(nextViewFrameMode("map")).toBe("odom");
        expect(nextViewFrameMode("odom")).toBe("auto");
    });
});
