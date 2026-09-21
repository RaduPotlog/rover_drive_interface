import { describe, expect, it } from "vitest";

import { quaternionFromYaw } from "../src/lib/geometry";
import { TfBuffer, type TransformStamped } from "../src/lib/tf";

const tf = (parent: string, child: string, x: number, y: number, yaw: number): TransformStamped => ({
    header: { frame_id: parent },
    child_frame_id: child,
    transform: { translation: { x, y, z: 0 }, rotation: quaternionFromYaw(yaw) },
});

describe("TfBuffer", () => {
    it("chains map -> odom -> base_link, ignoring leading slashes", () => {
        const buf = new TfBuffer();
        buf.add([tf("rover/map", "rover/odom", 10, 0, Math.PI / 2)]);
        buf.add([tf("/rover/odom", "rover/base_footprint", 1, 0, 0), tf("rover/base_footprint", "rover/base_link", 0, 0, 0)]);
        const pose = buf.lookup("rover/map", "rover/base_link")!;
        expect(pose.x).toBeCloseTo(10, 9);
        expect(pose.y).toBeCloseTo(1, 9);
        expect(pose.theta).toBeCloseTo(Math.PI / 2, 9);
    });

    it("resolves through a common ancestor that is not the target", () => {
        const buf = new TfBuffer();
        buf.add([tf("map", "a", 1, 0, 0), tf("map", "b", 0, 2, 0)]);
        const pose = buf.lookup("a", "b")!;
        expect(pose.x).toBeCloseTo(-1, 9);
        expect(pose.y).toBeCloseTo(2, 9);
    });

    it("returns null for disconnected frames and the latest edge wins", () => {
        const buf = new TfBuffer();
        buf.add([tf("map", "odom", 0, 0, 0)]);
        expect(buf.lookup("map", "base_link")).toBeNull();
        buf.add([tf("odom", "base_link", 1, 0, 0)]);
        buf.add([tf("odom", "base_link", 2, 0, 0)]);
        expect(buf.lookup("map", "base_link")!.x).toBeCloseTo(2, 9);
    });

    it("reports the age of the oldest edge on the chain", () => {
        const buf = new TfBuffer();
        buf.add([tf("map", "odom", 0, 0, 0)], 1000);
        buf.add([tf("odom", "base_link", 0, 0, 0)], 5000);
        expect(buf.age("base_link", 6000)).toBe(5000);
        expect(buf.age("nowhere", 6000)).toBeNull();
    });
});
