import { describe, expect, it } from "vitest";

import { formatDistance, formatRulerLabel, measure, niceScaleLength } from "../src/lib/ruler";
import { MAX_SCALE, MIN_SCALE, screenToWorld } from "../src/lib/view";

const size = { width: 800, height: 600 };

describe("map ruler", () => {
    it("measures straight-line distance in metres", () => {
        expect(measure({ x: 1, y: 1 }, { x: 4, y: 5 }).distance).toBeCloseTo(5, 12);
        expect(measure({ x: 2, y: 2 }, { x: 2, y: 2 }).distance).toBe(0);
    });

    it("gives the direction counter-clockwise from +x", () => {
        expect(measure({ x: 0, y: 0 }, { x: 1, y: 0 }).angle).toBeCloseTo(0, 12);
        expect(measure({ x: 0, y: 0 }, { x: 0, y: 1 }).angle).toBeCloseTo(Math.PI / 2, 12);
        expect(measure({ x: 0, y: 0 }, { x: -1, y: -1 }).angle).toBeCloseTo((-3 * Math.PI) / 4, 12);
    });

    it("formats centimetres below a metre and fewer decimals far away", () => {
        expect(formatDistance(0.426)).toBe("43 cm");
        expect(formatDistance(3.4249)).toBe("3.42 m");
        expect(formatDistance(123.44)).toBe("123.4 m");
    });

    it("labels distance, direction and the map's cell size", () => {
        const m = measure({ x: 0, y: 0 }, { x: 3, y: 4 });
        expect(formatRulerLabel(m, 0.05)).toBe("5.00 m · 53° · ±5 cm");
        expect(formatRulerLabel(m)).toBe("5.00 m · 53°");
        expect(formatRulerLabel(measure({ x: 1, y: 1 }, { x: 1, y: 1 }), 0.1)).toBe("0 cm · ±10 cm");
    });

    it("measures the same distance whichever way the map is turned", () => {
        const a = { x: 100, y: 120 };
        const b = { x: 520, y: 380 };
        const upright = { cx: 3, cy: -2, scale: 37 };
        const turned = { ...upright, rotation: 1.2 };
        const d0 = measure(screenToWorld(upright, size, a), screenToWorld(upright, size, b)).distance;
        const d1 = measure(screenToWorld(turned, size, a), screenToWorld(turned, size, b)).distance;
        expect(d1).toBeCloseTo(d0, 9);
        expect(d0).toBeCloseTo(Math.hypot(420, 260) / 37, 9);
    });

    it("picks a 1/2/5 scale bar length that fits", () => {
        expect(niceScaleLength(40)).toEqual({ meters: 2, px: 80 });
        expect(niceScaleLength(20)).toEqual({ meters: 5, px: 100 });
        expect(niceScaleLength(100)).toEqual({ meters: 1, px: 100 });
        expect(niceScaleLength(MAX_SCALE).meters).toBe(0.2);
        expect(niceScaleLength(MIN_SCALE).meters).toBe(50);
        for (let s = MIN_SCALE; s <= MAX_SCALE; s *= 1.07) {
            const { meters, px } = niceScaleLength(s);
            expect(px).toBeLessThanOrEqual(100 + 1e-6);
            expect(px).toBeGreaterThan(39); // never less than 2/5 of the target
            const mantissa = meters / 10 ** Math.floor(Math.log10(meters));
            expect([1, 2, 5]).toContain(Math.round(mantissa * 1e6) / 1e6);
        }
    });
});
