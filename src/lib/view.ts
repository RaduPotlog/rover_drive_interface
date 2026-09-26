// World (map frame, metres, y up) <-> screen (CSS pixels, y down) for the map canvas.

import { normalizeAngle } from "./geometry";

export interface View {
    /** World point at the centre of the canvas. */
    cx: number;
    cy: number;
    /** Pixels per metre. */
    scale: number;
    /**
     * How far the world is turned counter-clockwise on screen [rad]; 0 (or absent) is map-up:
     * the view frame's +y points up the screen. There is no true-north reference, so map-up is
     * north only where the map frame is aligned with east/north (GPS mode).
     */
    rotation?: number;
}

export interface Size {
    width: number;
    height: number;
}

export const MIN_SCALE = 2; // whole building
export const MAX_SCALE = 400; // centimetre detail

/** Quarter turn: the rotate buttons' step and what gestures snap to. */
export const QUARTER_TURN = Math.PI / 2;
/** Gesture rotations within this of a quarter turn snap onto it [rad]. */
export const SNAP_TOLERANCE = (5 * Math.PI) / 180;

const rot = (view: View) => view.rotation ?? 0;

export const worldToScreen = (view: View, size: Size, p: { x: number; y: number }) => {
    const r = rot(view);
    const dx = p.x - view.cx;
    const dy = p.y - view.cy;
    const rx = dx * Math.cos(r) - dy * Math.sin(r);
    const ry = dx * Math.sin(r) + dy * Math.cos(r);
    return {
        x: size.width / 2 + rx * view.scale,
        y: size.height / 2 - ry * view.scale,
    };
};

export const screenToWorld = (view: View, size: Size, p: { x: number; y: number }) => {
    const r = rot(view);
    const rx = (p.x - size.width / 2) / view.scale;
    const ry = -(p.y - size.height / 2) / view.scale;
    return {
        x: view.cx + rx * Math.cos(r) + ry * Math.sin(r),
        y: view.cy - rx * Math.sin(r) + ry * Math.cos(r),
    };
};

/**
 * Canvas transform (the setTransform arguments a..f) from world coordinates to device pixels:
 * the same mapping as worldToScreen, for drawing images in world units.
 */
export const viewMatrix = (view: View, size: Size, dpr = 1): [number, number, number, number, number, number] => {
    const r = rot(view);
    const k = view.scale * dpr;
    const a = k * Math.cos(r);
    const b = -k * Math.sin(r);
    const c = -k * Math.sin(r);
    const d = -k * Math.cos(r);
    const e = (size.width / 2) * dpr - (a * view.cx + c * view.cy);
    const f = (size.height / 2) * dpr - (b * view.cx + d * view.cy);
    return [a, b, c, d, e, f];
};

const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/** Keep the world point that was under `anchor` (screen px) under it after changing `next`. */
const keepAnchor = (view: View, next: View, size: Size, anchor: { x: number; y: number }): View => {
    const before = screenToWorld(view, size, anchor);
    const after = screenToWorld(next, size, anchor);
    return { ...next, cx: next.cx + before.x - after.x, cy: next.cy + before.y - after.y };
};

/** Zoom by `factor` keeping the world point under `anchor` (screen px) fixed. */
export const zoomAt = (view: View, size: Size, anchor: { x: number; y: number }, factor: number): View =>
    keepAnchor(view, { ...view, scale: clampScale(view.scale * factor) }, size, anchor);

/** Turn the map by `dAngle` [rad, counter-clockwise] keeping the world point under `anchor` fixed. */
export const rotateAt = (view: View, size: Size, anchor: { x: number; y: number }, dAngle: number): View =>
    keepAnchor(view, { ...view, rotation: normalizeAngle(rot(view) + dAngle) }, size, anchor);

/** Pan by a screen-space delta. */
export const panBy = (view: View, dx: number, dy: number): View => {
    const r = rot(view);
    // Screen delta (y down) -> rotated-view delta (y up) -> world delta.
    const rx = dx / view.scale;
    const ry = -dy / view.scale;
    return {
        ...view,
        cx: view.cx - (rx * Math.cos(r) + ry * Math.sin(r)),
        cy: view.cy - (-rx * Math.sin(r) + ry * Math.cos(r)),
    };
};

/** `angle` normalised to (-pi, pi], snapped onto a multiple of `step` when within `tolerance`. */
export const snapRotation = (angle: number, step = QUARTER_TURN, tolerance = SNAP_TOLERANCE): number => {
    const a = normalizeAngle(angle);
    const nearest = Math.round(a / step) * step;
    return Math.abs(a - nearest) <= tolerance ? normalizeAngle(nearest) : a;
};

/** Rotation that puts a rover heading `robotTheta` (view frame) pointing up the screen. */
export const headingUpRotation = (robotTheta: number): number => normalizeAngle(Math.PI / 2 - robotTheta);

/** Axis-aligned world box around everything on screen (all four corners, so rotation is covered). */
export const visibleWorldBounds = (view: View, size: Size) => {
    const corners = [
        { x: 0, y: 0 }, { x: size.width, y: 0 }, { x: size.width, y: size.height }, { x: 0, y: size.height },
    ].map((p) => screenToWorld(view, size, p));
    return {
        minX: Math.min(...corners.map((c) => c.x)),
        maxX: Math.max(...corners.map((c) => c.x)),
        minY: Math.min(...corners.map((c) => c.y)),
        maxY: Math.max(...corners.map((c) => c.y)),
    };
};

/** View that fits a world rectangle with a margin, drawn at `rotation`. */
export const fitBounds = (
    size: Size,
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    margin = 0.05,
    rotation = 0,
): View => {
    const w = Math.max(bounds.maxX - bounds.minX, 1e-3);
    const h = Math.max(bounds.maxY - bounds.minY, 1e-3);
    // Extent of the turned rectangle along the screen axes.
    const c = Math.abs(Math.cos(rotation));
    const s = Math.abs(Math.sin(rotation));
    const sw = w * c + h * s;
    const sh = w * s + h * c;
    const scale = clampScale(Math.min(size.width / sw, size.height / sh) * (1 - 2 * margin));
    return { cx: (bounds.minX + bounds.maxX) / 2, cy: (bounds.minY + bounds.maxY) / 2, scale, rotation };
};
