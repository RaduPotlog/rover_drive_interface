import { describe, expect, it } from "vitest";

import { fitBounds, panBy, screenToWorld, worldToScreen, zoomAt } from "../src/lib/view";

const size = { width: 800, height: 600 };

describe("map view", () => {
    it("round-trips world and screen, with y up in the world", () => {
        const view = { cx: 1, cy: 2, scale: 50 };
        expect(worldToScreen(view, size, { x: 1, y: 2 })).toEqual({ x: 400, y: 300 });
        expect(worldToScreen(view, size, { x: 2, y: 3 })).toEqual({ x: 450, y: 250 });
        const w = screenToWorld(view, size, { x: 123, y: 456 });
        const s = worldToScreen(view, size, w);
        expect(s.x).toBeCloseTo(123, 9);
        expect(s.y).toBeCloseTo(456, 9);
    });

    it("zooms around the anchor", () => {
        const view = { cx: 0, cy: 0, scale: 20 };
        const anchor = { x: 600, y: 100 };
        const before = screenToWorld(view, size, anchor);
        const zoomed = zoomAt(view, size, anchor, 2);
        expect(zoomed.scale).toBe(40);
        const after = screenToWorld(zoomed, size, anchor);
        expect(after.x).toBeCloseTo(before.x, 9);
        expect(after.y).toBeCloseTo(before.y, 9);
    });

    it("clamps zoom and pans in screen space", () => {
        expect(zoomAt({ cx: 0, cy: 0, scale: 300 }, size, { x: 0, y: 0 }, 10).scale).toBe(400);
        const panned = panBy({ cx: 0, cy: 0, scale: 10 }, 100, 50);
        expect(panned.cx).toBeCloseTo(-10, 9);
        expect(panned.cy).toBeCloseTo(5, 9);
    });

    it("fits bounds", () => {
        const v = fitBounds(size, { minX: 0, minY: 0, maxX: 40, maxY: 10 }, 0);
        expect(v.cx).toBe(20);
        expect(v.cy).toBe(5);
        expect(v.scale).toBe(20);
    });
});
