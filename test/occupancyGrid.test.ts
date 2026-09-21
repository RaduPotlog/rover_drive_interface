import { describe, expect, it } from "vitest";

import { costmapColor, gridToRgba, mapColor } from "../src/lib/occupancyGrid";

const info = (width: number, height: number) => ({
    resolution: 0.05,
    width,
    height,
    origin: { position: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
});

describe("occupancy grid", () => {
    it("flips rows so grid row 0 (map bottom) becomes the last image row", () => {
        // 1 x 2 grid: bottom cell occupied, top cell free.
        const rgba = gridToRgba({ info: info(1, 2), data: [100, 0] }, "map");
        expect(Array.from(rgba.slice(0, 4))).toEqual(mapColor(0)); // image top = grid row 1
        expect(Array.from(rgba.slice(4, 8))).toEqual(mapColor(100));
    });

    it("treats -1 and 255 as unknown", () => {
        const a = gridToRgba({ info: info(1, 1), data: new Int8Array([-1]) }, "map");
        const b = gridToRgba({ info: info(1, 1), data: [255] }, "map");
        expect(Array.from(a)).toEqual(mapColor(-1));
        expect(Array.from(b)).toEqual(mapColor(-1));
    });

    it("costmap is transparent where free and opaque red at lethal", () => {
        expect(costmapColor(0)[3]).toBe(0);
        expect(costmapColor(100)[0]).toBeGreaterThan(200);
        expect(costmapColor(50)[3]).toBeGreaterThan(0);
    });
});
