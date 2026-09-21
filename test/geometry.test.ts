import { describe, expect, it } from "vitest";

import { compose, invert, normalizeAngle, quaternionFromYaw, transformPoint, yawFromQuaternion } from "../src/lib/geometry";

describe("geometry", () => {
    it("round-trips yaw through a quaternion", () => {
        for (const yaw of [0, 0.5, -1.2, Math.PI / 2, 3.0]) {
            expect(yawFromQuaternion(quaternionFromYaw(yaw))).toBeCloseTo(yaw, 9);
        }
    });

    it("normalizes angles into (-pi, pi]", () => {
        expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 9);
        expect(normalizeAngle(-Math.PI)).toBeCloseTo(Math.PI, 9);
        expect(normalizeAngle(-0.5 - 2 * Math.PI)).toBeCloseTo(-0.5, 9);
    });

    it("composes and inverts planar transforms", () => {
        const a = { x: 1, y: 2, theta: Math.PI / 2 };
        const b = { x: 1, y: 0, theta: 0 };
        const ab = compose(a, b);
        expect(ab.x).toBeCloseTo(1, 9);
        expect(ab.y).toBeCloseTo(3, 9);
        expect(ab.theta).toBeCloseTo(Math.PI / 2, 9);
        const id = compose(a, invert(a));
        expect(id.x).toBeCloseTo(0, 9);
        expect(id.y).toBeCloseTo(0, 9);
        expect(id.theta).toBeCloseTo(0, 9);
    });

    it("transforms points", () => {
        const p = transformPoint({ x: 1, y: 0, theta: Math.PI }, { x: 1, y: 0 });
        expect(p.x).toBeCloseTo(0, 9);
        expect(p.y).toBeCloseTo(0, 9);
    });
});
