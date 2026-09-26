import { describe, expect, it } from "vitest";

import {
    fitBounds, headingUpRotation, panBy, rotateAt, screenToWorld, snapRotation, viewMatrix, visibleWorldBounds,
    worldToScreen, zoomAt,
} from "../src/lib/view";

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

describe("rotated map view", () => {
    const deg = (d: number) => (d * Math.PI) / 180;

    it("round-trips world and screen at any rotation", () => {
        const view = { cx: 3, cy: -2, scale: 37, rotation: 0.7 };
        const w = screenToWorld(view, size, { x: 123, y: 456 });
        const s = worldToScreen(view, size, w);
        expect(s.x).toBeCloseTo(123, 9);
        expect(s.y).toBeCloseTo(456, 9);
    });

    it("turns +x up the screen at 90 degrees", () => {
        const view = { cx: 0, cy: 0, scale: 10, rotation: Math.PI / 2 };
        const p = worldToScreen(view, size, { x: 1, y: 0 });
        expect(p.x).toBeCloseTo(400, 9);
        expect(p.y).toBeCloseTo(290, 9);
        const q = worldToScreen(view, size, { x: 0, y: 1 }); // +y goes left
        expect(q.x).toBeCloseTo(390, 9);
        expect(q.y).toBeCloseTo(300, 9);
    });

    it("pans along the rotated axes: dragging right moves the world with the finger", () => {
        const view = { cx: 0, cy: 0, scale: 10, rotation: Math.PI / 2 };
        const grabbed = screenToWorld(view, size, { x: 400, y: 300 });
        const panned = panBy(view, 100, 0);
        const now = worldToScreen(panned, size, grabbed);
        expect(now.x).toBeCloseTo(500, 9);
        expect(now.y).toBeCloseTo(300, 9);
    });

    it("keeps the anchor fixed when zooming or rotating", () => {
        const view = { cx: 1, cy: 1, scale: 20, rotation: 0.3 };
        const anchor = { x: 650, y: 120 };
        const before = screenToWorld(view, size, anchor);
        for (const next of [zoomAt(view, size, anchor, 1.7), rotateAt(view, size, anchor, deg(30))]) {
            const after = screenToWorld(next, size, anchor);
            expect(after.x).toBeCloseTo(before.x, 9);
            expect(after.y).toBeCloseTo(before.y, 9);
        }
        expect(rotateAt(view, size, anchor, deg(30)).rotation).toBeCloseTo(0.3 + deg(30), 9);
        expect(zoomAt(view, size, anchor, 2).rotation).toBe(0.3);
    });

    it("fits a turned rectangle by its turned extent", () => {
        // 40 x 10 m turned a quarter: 10 m wide, 40 m tall on an 800 x 600 canvas.
        const v = fitBounds(size, { minX: 0, minY: 0, maxX: 40, maxY: 10 }, 0, Math.PI / 2);
        expect(v.scale).toBeCloseTo(15, 9);
        expect(v.rotation).toBe(Math.PI / 2);
    });

    it("gives a canvas matrix that agrees with worldToScreen", () => {
        const view = { cx: -4, cy: 7, scale: 25, rotation: -1.1 };
        const [a, b, c, d, e, f] = viewMatrix(view, size, 2);
        for (const w of [{ x: 0, y: 0 }, { x: 3, y: -5 }, { x: -12, y: 9 }]) {
            const s = worldToScreen(view, size, w);
            expect((a * w.x + c * w.y + e) / 2).toBeCloseTo(s.x, 9);
            expect((b * w.x + d * w.y + f) / 2).toBeCloseTo(s.y, 9);
        }
    });

    it("snaps onto quarter turns only when close", () => {
        expect(snapRotation(deg(93))).toBeCloseTo(deg(90), 12);
        expect(snapRotation(deg(-4))).toBeCloseTo(0, 12);
        expect(snapRotation(deg(20))).toBeCloseTo(deg(20), 12);
        expect(snapRotation(deg(360 + 178))).toBeCloseTo(Math.PI, 12);
    });

    it("puts the rover's heading up the screen", () => {
        expect(headingUpRotation(0)).toBeCloseTo(Math.PI / 2, 12);
        const view = { cx: 0, cy: 0, scale: 10, rotation: headingUpRotation(deg(30)) };
        const nose = worldToScreen(view, size, { x: Math.cos(deg(30)), y: Math.sin(deg(30)) });
        expect(nose.x).toBeCloseTo(400, 9);
        expect(nose.y).toBeCloseTo(290, 9);
    });

    it("covers every screen corner in the visible bounds", () => {
        const view = { cx: 2, cy: 2, scale: 20, rotation: deg(45) };
        const b = visibleWorldBounds(view, size);
        for (const corner of [{ x: 0, y: 0 }, { x: 800, y: 0 }, { x: 800, y: 600 }, { x: 0, y: 600 }]) {
            const w = screenToWorld(view, size, corner);
            expect(w.x).toBeGreaterThanOrEqual(b.minX - 1e-9);
            expect(w.x).toBeLessThanOrEqual(b.maxX + 1e-9);
            expect(w.y).toBeGreaterThanOrEqual(b.minY - 1e-9);
            expect(w.y).toBeLessThanOrEqual(b.maxY + 1e-9);
        }
    });
});
