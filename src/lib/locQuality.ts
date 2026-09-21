// Localization quality, as the Boxer / OTTO UI shows it: how well does the rover's pose
// explain what the lidar sees right now, and how sure is AMCL about that pose?
//
// 1. Scan-to-map match: the share of lidar endpoints that land on (or within a few cm of) an
//    occupied cell of the saved map. High = the pose fits the walls; low = lost, or the world
//    changed (furniture, people, open doors).
// 2. AMCL's own uncertainty: the standard deviation from amcl_pose's covariance.
//
// Pure functions only - the map view feeds them, the top bar shows the result.
import { invert, type Pose2D, poseFromRos, transformPoint } from "./geometry";
import type { OccupancyGrid } from "./occupancyGrid";

const OCCUPIED = 65; // same threshold as mapColor / map_saver's occupied_thresh

export interface MatchGrid {
    width: number;
    height: number;
    resolution: number;
    /** Grid origin in the map frame; world -> cell goes through its inverse. */
    toGrid: Pose2D;
    /** 1 where an occupied cell is within the tolerance. */
    near: Uint8Array;
}

/** Dilate the occupied cells by `toleranceM` (square window, separable max filter). */
export const buildMatchGrid = (grid: Pick<OccupancyGrid, "info" | "data">, toleranceM = 0.1): MatchGrid => {
    const { width, height, resolution } = grid.info;
    const r = Math.max(0, Math.ceil(toleranceM / resolution));
    const occ = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
        const v = grid.data[i] ?? -1;
        const signed = v > 127 ? v - 256 : v;
        occ[i] = signed >= OCCUPIED ? 1 : 0;
    }
    // Horizontal pass, then vertical pass.
    const rows = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let hit = 0;
            for (let dx = -r; dx <= r && !hit; dx++) {
                const xx = x + dx;
                if (xx >= 0 && xx < width) hit = occ[y * width + xx];
            }
            rows[y * width + x] = hit;
        }
    }
    const near = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let hit = 0;
            for (let dy = -r; dy <= r && !hit; dy++) {
                const yy = y + dy;
                if (yy >= 0 && yy < height) hit = rows[yy * width + x];
            }
            near[y * width + x] = hit;
        }
    }
    const origin = poseFromRos(grid.info.origin.position, grid.info.origin.orientation);
    return { width, height, resolution, toGrid: invert(origin), near };
};

/** Is this map-frame point on (or near) a wall? Outside the map counts as not matched. */
export const isNearWall = (mg: MatchGrid, p: { x: number; y: number }): boolean => {
    const g = transformPoint(mg.toGrid, p);
    const cx = Math.floor(g.x / mg.resolution);
    const cy = Math.floor(g.y / mg.resolution);
    if (cx < 0 || cy < 0 || cx >= mg.width || cy >= mg.height) return false;
    return mg.near[cy * mg.width + cx] === 1;
};

export interface ScanMatch {
    ratio: number; // 0..1
    count: number; // endpoints considered
}

export const scanMatch = (mg: MatchGrid, points: { x: number; y: number }[]): ScanMatch => {
    if (points.length === 0) return { ratio: 0, count: 0 };
    let hits = 0;
    for (const p of points) if (isNearWall(mg, p)) hits++;
    return { ratio: hits / points.length, count: points.length };
};

export type QualityLevel = "good" | "fair" | "poor" | "unknown";

export interface QualityInput {
    match: ScanMatch | null;
    /** sqrt(max(var x, var y)) from amcl_pose, metres; null when AMCL is not reporting. */
    sigmaXY: number | null;
}

export interface Quality {
    level: QualityLevel;
    label: string;
    detail: string;
    percent: number | null;
}

export const MIN_POINTS = 30;
export const GOOD_MATCH = 0.7;
export const POOR_MATCH = 0.4;
export const GOOD_SIGMA = 0.35;
export const POOR_SIGMA = 1.0;

export const classifyQuality = ({ match, sigmaXY }: QualityInput): Quality => {
    const sigmaText = sigmaXY === null ? "no AMCL estimate" : `AMCL ±${sigmaXY.toFixed(2)} m`;
    if (!match || match.count < MIN_POINTS) {
        return { level: "unknown", label: "—", detail: `Not enough lidar points on the map yet · ${sigmaText}`, percent: null };
    }
    const percent = Math.round(match.ratio * 100);
    const detail = `${percent}% of lidar points match the map · ${sigmaText}`;
    if (match.ratio < POOR_MATCH || (sigmaXY !== null && sigmaXY > POOR_SIGMA)) {
        return { level: "poor", label: "Poor", detail: `${detail}. Use Set pose, or Find me if unsure.`, percent };
    }
    if (match.ratio >= GOOD_MATCH && (sigmaXY === null || sigmaXY <= GOOD_SIGMA)) {
        return { level: "good", label: "Good", detail, percent };
    }
    return { level: "fair", label: "Fair", detail, percent };
};

/** Exponential smoothing so the indicator does not flicker scan to scan. */
export const smooth = (previous: number | null, next: number, alpha = 0.3): number =>
    previous === null ? next : previous + alpha * (next - previous);

/** sqrt of the larger x/y variance of a ROS 6x6 pose covariance. */
export const sigmaFromCovariance = (covariance: ArrayLike<number>): number | null => {
    const vx = covariance[0];
    const vy = covariance[7];
    if (!Number.isFinite(vx) || !Number.isFinite(vy) || vx < 0 || vy < 0) return null;
    return Math.sqrt(Math.max(vx, vy));
};
