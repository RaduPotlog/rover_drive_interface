// Map ruler: distances between two points of the view frame (metres), and the scale bar.

export interface Measurement {
    /** Straight-line distance [m]. */
    distance: number;
    /** Direction from the first to the second point in the view frame [rad]: 0 along +x, counter-clockwise positive. */
    angle: number;
}

export const measure = (a: { x: number; y: number }, b: { x: number; y: number }): Measurement => ({
    distance: Math.hypot(b.x - a.x, b.y - a.y),
    angle: Math.atan2(b.y - a.y, b.x - a.x),
});

export const formatDistance = (m: number): string => {
    if (m < 1) return `${Math.round(m * 100)} cm`;
    if (m < 100) return `${m.toFixed(2)} m`;
    return `${m.toFixed(1)} m`;
};

/**
 * "3.42 m · 37° · ±0.05 m". The ± is the map's cell size: walls are only placed to within a
 * cell, so that is the precision of a distance read off the map. Left out without a map.
 */
export const formatRulerLabel = (m: Measurement, resolution?: number): string => {
    const parts = [formatDistance(m.distance)];
    if (m.distance > 0) parts.push(`${Math.round((m.angle * 180) / Math.PI)}°`);
    if (resolution && resolution > 0) parts.push(`±${formatDistance(resolution)}`);
    return parts.join(" · ");
};

/** Largest 1/2/5 x 10^n metre length that fits in `targetPx` at `pxPerMeter`, and its width [px]. */
export const niceScaleLength = (pxPerMeter: number, targetPx = 100): { meters: number; px: number } => {
    const max = targetPx / pxPerMeter;
    const decade = 10 ** Math.floor(Math.log10(max));
    // Floating-point decades (e.g. 0.1 * 5) carry noise; round to the decade's precision.
    const clean = (x: number) => Number(x.toPrecision(6));
    const meters = clean(([5, 2, 1].map((f) => f * decade).find((l) => l <= max * (1 + 1e-9)) ?? decade));
    return { meters, px: meters * pxPerMeter };
};
