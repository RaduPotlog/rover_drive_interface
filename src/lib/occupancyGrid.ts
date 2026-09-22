// nav_msgs/OccupancyGrid -> RGBA pixels. Row 0 of the grid is the bottom of the map (the
// origin corner), while row 0 of an image is the top, so rows are flipped here and the
// renderer can draw the image with y pointing down.

export interface GridInfo {
    resolution: number;
    width: number;
    height: number;
    origin: { position: { x: number; y: number; z: number }; orientation: { x: number; y: number; z: number; w: number } };
}

export interface OccupancyGrid {
    header: { frame_id: string };
    info: GridInfo;
    data: Int8Array | number[];
}

export type Palette = "map" | "costmap";

type Rgba = [number, number, number, number];

const UNKNOWN_MAP: Rgba = [58, 63, 71, 255];
const FREE_MAP: Rgba = [236, 238, 241, 255];
const OCCUPIED_MAP: Rgba = [24, 26, 30, 255];

const css = ([r, g, b]: Rgba) => `rgb(${r}, ${g}, ${b})`;
/** The map palette as CSS colours, for the legend. */
export const MAP_LEGEND_COLORS = { free: css(FREE_MAP), wall: css(OCCUPIED_MAP), unknown: css(UNKNOWN_MAP) };

export const mapColor = (value: number): Rgba => {
    if (value < 0) return UNKNOWN_MAP;
    if (value >= 65) return OCCUPIED_MAP;
    if (value <= 25) return FREE_MAP;
    // In between: shade linearly so partially known cells stay visible.
    const t = (value - 25) / 40;
    const c = Math.round(FREE_MAP[0] + (OCCUPIED_MAP[0] - FREE_MAP[0]) * t);
    return [c, c, c, 255];
};

// Costmap values are 0..100 after nav2's scaling (253/254 inflated/lethal -> 99/100,
// 255 unknown -> -1). Transparent where free so it overlays the static map.
export const costmapColor = (value: number): Rgba => {
    if (value <= 0) return [0, 0, 0, 0];
    if (value >= 99) return [214, 40, 57, 170]; // lethal / inscribed
    const t = value / 98;
    return [Math.round(60 + 170 * t), Math.round(120 - 60 * t), Math.round(220 - 160 * t), Math.round(40 + 90 * t)];
};

export const gridToRgba = (grid: Pick<OccupancyGrid, "info" | "data">, palette: Palette): Uint8ClampedArray => {
    const { width, height } = grid.info;
    const out = new Uint8ClampedArray(width * height * 4);
    const color = palette === "map" ? mapColor : costmapColor;
    for (let row = 0; row < height; row++) {
        const imageRow = height - 1 - row;
        for (let col = 0; col < width; col++) {
            const value = grid.data[row * width + col] ?? -1;
            // Int8Array already yields signed values; plain arrays from a JSON path may carry 255.
            const signed = value > 127 ? value - 256 : value;
            const [r, g, b, a] = color(signed);
            const o = (imageRow * width + col) * 4;
            out[o] = r;
            out[o + 1] = g;
            out[o + 2] = b;
            out[o + 3] = a;
        }
    }
    return out;
};
