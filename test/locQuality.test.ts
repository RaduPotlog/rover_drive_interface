import { describe, expect, it } from "vitest";

import {
    buildMatchGrid,
    classifyPoint,
    classifyQuality,
    isNearWall,
    scanMatch,
    sigmaFromCovariance,
    smooth,
} from "../src/lib/locQuality";

// 20 x 20 cells of 0.05 m (1 x 1 m) with its origin at (-0.5, -0.5): a wall along x = 0.2 m.
const grid = () => {
    const width = 20;
    const height = 20;
    const data = new Array(width * height).fill(0);
    const wallCol = Math.floor((0.2 + 0.5) / 0.05); // 14
    for (let y = 0; y < height; y++) data[y * width + wallCol] = 100;
    return {
        info: {
            resolution: 0.05,
            width,
            height,
            origin: { position: { x: -0.5, y: -0.5, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
        },
        data,
    };
};

describe("scan-to-map match", () => {
    it("finds points on and near the wall, not in free space or off the map", () => {
        const mg = buildMatchGrid(grid(), 0.1); // 2-cell tolerance
        expect(isNearWall(mg, { x: 0.22, y: 0.0 })).toBe(true); // on the wall
        expect(isNearWall(mg, { x: 0.13, y: 0.0 })).toBe(true); // 8 cm off: within tolerance
        expect(isNearWall(mg, { x: -0.2, y: 0.0 })).toBe(false); // free space
        expect(isNearWall(mg, { x: 3.0, y: 0.0 })).toBe(false); // off the map
    });

    it("computes the matched share", () => {
        const mg = buildMatchGrid(grid(), 0.1);
        const pts = [{ x: 0.22, y: 0.1 }, { x: 0.21, y: -0.3 }, { x: -0.3, y: 0 }, { x: 0.0, y: 0.4 }];
        expect(scanMatch(mg, pts)).toEqual({ ratio: 0.5, count: 4 });
        expect(scanMatch(mg, [])).toEqual({ ratio: 0, count: 0 });
    });

    it("honours a rotated grid origin", () => {
        const g = grid();
        // Rotate the grid 90 deg about the map origin: its wall (grid x = 0.7 m) now runs along y.
        g.info.origin = { position: { x: 0.5, y: -0.5, z: 0 }, orientation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 } };
        const mg = buildMatchGrid(g, 0.05);
        expect(isNearWall(mg, { x: 0.0, y: 0.22 })).toBe(true);
        expect(isNearWall(mg, { x: 0.22, y: 0.0 })).toBe(false);
    });
});

describe("quality classification", () => {
    const m = (ratio: number, count = 200) => ({ ratio, count });

    it("needs enough points", () => {
        expect(classifyQuality({ match: m(0.9, 10), sigmaXY: 0.1 }).level).toBe("unknown");
        expect(classifyQuality({ match: null, sigmaXY: 0.1 }).level).toBe("unknown");
    });

    it("grades by match share and AMCL spread", () => {
        expect(classifyQuality({ match: m(0.85), sigmaXY: 0.1 })).toMatchObject({ level: "good", percent: 85 });
        expect(classifyQuality({ match: m(0.85), sigmaXY: 0.6 }).level).toBe("fair");
        expect(classifyQuality({ match: m(0.55), sigmaXY: 0.1 }).level).toBe("fair");
        expect(classifyQuality({ match: m(0.3), sigmaXY: 0.1 }).level).toBe("poor");
        expect(classifyQuality({ match: m(0.9), sigmaXY: 1.5 }).level).toBe("poor");
        expect(classifyQuality({ match: m(0.9), sigmaXY: null }).level).toBe("good");
        expect(classifyQuality({ match: m(0.3), sigmaXY: 0.1 }).detail).toContain("Set pose");
    });

    it("smooths and reads covariance", () => {
        expect(smooth(null, 0.8)).toBe(0.8);
        expect(smooth(0.8, 0.2, 0.5)).toBeCloseTo(0.5, 9);
        const cov = new Array(36).fill(0);
        cov[0] = 0.04;
        cov[7] = 0.09;
        expect(sigmaFromCovariance(cov)).toBeCloseTo(0.3, 9);
        cov[0] = Number.NaN;
        expect(sigmaFromCovariance(cov)).toBeNull();
    });
});

describe("matching while mapping", () => {
    // The fixture's left half (x < 0) still unknown, as on a map SLAM is still building.
    const partial = () => {
        const g = grid();
        for (let y = 0; y < 20; y++) for (let x = 0; x < 10; x++) g.data[y * 20 + x] = -1;
        return g;
    };

    it("tells wall, new (unknown or off-map) and conflict (mapped free space) apart", () => {
        const mg = buildMatchGrid(partial(), 0.05);
        expect(classifyPoint(mg, { x: 0.2, y: 0 })).toBe("wall");
        expect(classifyPoint(mg, { x: -0.3, y: 0 })).toBe("new");
        expect(classifyPoint(mg, { x: 5, y: 5 })).toBe("new");
        expect(classifyPoint(mg, { x: 0.05, y: 0 })).toBe("conflict");
    });

    it("leaves unmapped points out, so new ground does not lower the score", () => {
        const mg = buildMatchGrid(partial(), 0.05);
        const pts = [{ x: 0.2, y: 0 }, { x: 0.2, y: 0.1 }, { x: 0.05, y: 0 }, { x: -0.3, y: 0 }, { x: 9, y: 9 }];
        expect(scanMatch(mg, pts, { ignoreUnknown: true })).toEqual({ ratio: 2 / 3, count: 3 });
        expect(scanMatch(mg, pts).count).toBe(5); // localization: every point counts
    });

    it("reads an empty map as not enough points, never 0%", () => {
        const g = grid();
        g.data.fill(-1);
        const m = scanMatch(buildMatchGrid(g), Array.from({ length: 100 }, (_, i) => ({ x: i / 100, y: 0 })), { ignoreUnknown: true });
        expect(m.count).toBe(0);
        const q = classifyQuality({ match: m, sigmaXY: null, mapping: true });
        expect(q.percent).toBeNull();
        expect(q.label).toBe("—");
    });

    it("gives mapping-specific advice when the score is poor", () => {
        const q = classifyQuality({ match: { ratio: 0.2, count: 100 }, sigmaXY: null, mapping: true });
        expect(q.level).toBe("poor");
        expect(q.detail).toContain("drifting");
        expect(q.detail).not.toContain("Set pose");
    });
});
