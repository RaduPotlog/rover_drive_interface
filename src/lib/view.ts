// World (map frame, metres, y up) <-> screen (CSS pixels, y down) for the map canvas.

export interface View {
    /** World point at the centre of the canvas. */
    cx: number;
    cy: number;
    /** Pixels per metre. */
    scale: number;
}

export interface Size {
    width: number;
    height: number;
}

export const MIN_SCALE = 2; // whole building
export const MAX_SCALE = 400; // centimetre detail

export const worldToScreen = (view: View, size: Size, p: { x: number; y: number }) => ({
    x: size.width / 2 + (p.x - view.cx) * view.scale,
    y: size.height / 2 - (p.y - view.cy) * view.scale,
});

export const screenToWorld = (view: View, size: Size, p: { x: number; y: number }) => ({
    x: view.cx + (p.x - size.width / 2) / view.scale,
    y: view.cy - (p.y - size.height / 2) / view.scale,
});

const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/** Zoom by `factor` keeping the world point under `anchor` (screen px) fixed. */
export const zoomAt = (view: View, size: Size, anchor: { x: number; y: number }, factor: number): View => {
    const scale = clampScale(view.scale * factor);
    const before = screenToWorld(view, size, anchor);
    const next = { ...view, scale };
    const after = screenToWorld(next, size, anchor);
    return { scale, cx: view.cx + before.x - after.x, cy: view.cy + before.y - after.y };
};

/** Pan by a screen-space delta. */
export const panBy = (view: View, dx: number, dy: number): View => ({
    ...view,
    cx: view.cx - dx / view.scale,
    cy: view.cy + dy / view.scale,
});

/** View that fits a world rectangle with a margin. */
export const fitBounds = (
    size: Size,
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    margin = 0.05,
): View => {
    const w = Math.max(bounds.maxX - bounds.minX, 1e-3);
    const h = Math.max(bounds.maxY - bounds.minY, 1e-3);
    const scale = clampScale(Math.min(size.width / w, size.height / h) * (1 - 2 * margin));
    return { cx: (bounds.minX + bounds.maxX) / 2, cy: (bounds.minY + bounds.maxY) / 2, scale };
};
