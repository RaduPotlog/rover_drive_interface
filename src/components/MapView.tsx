import { Map as MapIcon, Maximize2, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useApp } from "../AppContext";
import { useSubscriptionRef } from "../hooks/useSubscriptionRef";
import { normalizeAngle, type Pose2D, poseFromRos, transformPoint } from "../lib/geometry";
import { nsFrame, nsName } from "../lib/namespace";
import { buildMatchGrid, isNearWall, type MatchGrid, scanMatch, type ScanMatch } from "../lib/locQuality";
import { gridToRgba, type OccupancyGrid } from "../lib/occupancyGrid";
import type { LaserScan, Path, TFMessage } from "../lib/rosTypes";
import { TfBuffer } from "../lib/tf";
import { fitBounds, panBy, screenToWorld, type Size, type View, worldToScreen, zoomAt } from "../lib/view";

export type MapTool = "pan" | "setPose" | "goTo" | "place";

export interface MapMarker {
    id: string;
    label: string;
    pose: Pose2D;
    highlighted?: boolean;
}

interface GridLayer {
    image: HTMLCanvasElement;
    origin: Pose2D;
    resolution: number;
    width: number;
    height: number;
    frame: string;
}

const FOOTPRINT = 0.98; // m, square (rover_nav_params.yaml)
const TOOL_COLOR: Record<MapTool, string> = {
    pan: "#f5b400",
    setPose: "#3aa0ff",
    goTo: "#2fbf71",
    place: "#c38cff",
};

const toLayer = (grid: OccupancyGrid, palette: "map" | "costmap"): GridLayer => {
    const { width, height, resolution, origin } = grid.info;
    const image = document.createElement("canvas");
    image.width = width;
    image.height = height;
    const ctx = image.getContext("2d")!;
    ctx.putImageData(new ImageData(gridToRgba(grid, palette) as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);
    return {
        image,
        origin: poseFromRos(origin.position, origin.orientation),
        resolution,
        width,
        height,
        frame: grid.header.frame_id,
    };
};

/** Valid scan endpoints transformed into the map frame. */
const scanPointsInMap = (sc: LaserScan, toMap: Pose2D) => {
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < sc.ranges.length; i++) {
        const r = sc.ranges[i];
        if (!(r >= sc.range_min && r <= sc.range_max)) continue;
        const a = sc.angle_min + i * sc.angle_increment;
        out.push(transformPoint(toMap, { x: r * Math.cos(a), y: r * Math.sin(a) }));
    }
    return out;
};

export interface MapViewProps {
    tool: MapTool;
    /** Called when the operator finishes a click-and-drag with a pose tool. */
    onPoseDrawn: (tool: MapTool, pose: Pose2D) => void;
    /** Pending pose shown as an arrow until confirmed or cancelled. */
    pending: { tool: MapTool; pose: Pose2D } | null;
    markers: MapMarker[];
    onMarkerClick?: (id: string) => void;
    showCostmap: boolean;
    follow: boolean;
    onRobotPose?: (pose: Pose2D | null) => void;
    onMapFrame?: (frame: string | null) => void;
    /** Colour scan points by whether they hit the map, and report the share (localization quality). */
    scanMatchEnabled?: boolean;
    onScanMatch?: (match: ScanMatch | null) => void;
}

export const MapView = ({
    tool, onPoseDrawn, pending, markers, onMarkerClick, showCostmap, follow, onRobotPose, onMapFrame,
    scanMatchEnabled = false, onScanMatch,
}: MapViewProps) => {
    const { config } = useApp();
    const ns = config.namespace;
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const size = useRef<Size>({ width: 1, height: 1 });
    const view = useRef<View>({ cx: 0, cy: 0, scale: 40 });
    const fitted = useRef(false);
    const dirty = useRef(true);

    const tf = useRef(new TfBuffer());
    const mapLayer = useRef<GridLayer | null>(null);
    const matchGrid = useRef<MatchGrid | null>(null);
    const costLayer = useRef<GridLayer | null>(null);
    const scan = useRef<LaserScan | null>(null);
    const plan = useRef<Path | null>(null);
    const drag = useRef<{ tool: MapTool; start: { x: number; y: number }; pose: Pose2D } | null>(null);
    const pointers = useRef(new Map<number, { x: number; y: number }>());
    const [hasMap, setHasMap] = useState(false);

    const mapFrame = () => mapLayer.current?.frame ?? nsFrame(ns, "map");
    const baseFrame = nsFrame(ns, "base_link");
    const markDirty = () => { dirty.current = true };

    // --- data ------------------------------------------------------------------------
    useSubscriptionRef<TFMessage>("/tf", "tf2_msgs/msg/TFMessage", (m) => { tf.current.add(m.transforms); markDirty() });
    useSubscriptionRef<TFMessage>("/tf_static", "tf2_msgs/msg/TFMessage", (m) => { tf.current.add(m.transforms); markDirty() });
    useSubscriptionRef<OccupancyGrid>(nsName(ns, "map"), "nav_msgs/msg/OccupancyGrid", (m) => {
        mapLayer.current = toLayer(m, "map");
        matchGrid.current = buildMatchGrid(m, 0.1);
        setHasMap(true);
        onMapFrame?.(m.header.frame_id);
        markDirty();
    });
    useSubscriptionRef<OccupancyGrid>(
        showCostmap ? nsName(ns, "global_costmap/costmap") : null, "nav_msgs/msg/OccupancyGrid", (m) => {
            costLayer.current = toLayer(m, "costmap");
            markDirty();
        });
    useSubscriptionRef<LaserScan>(nsName(ns, "scan"), "sensor_msgs/msg/LaserScan", (m) => { scan.current = m; markDirty() });
    useSubscriptionRef<Path>(nsName(ns, "plan"), "nav_msgs/msg/Path", (m) => { plan.current = m; markDirty() });

    useEffect(() => {
        if (!showCostmap) costLayer.current = null;
        markDirty();
    }, [showCostmap]);
    useEffect(markDirty, [pending, markers, tool]);

    // Scan-to-map match for the localization-quality indicator, twice a second.
    useEffect(() => {
        if (!scanMatchEnabled || !onScanMatch) return;
        const id = setInterval(() => {
            const sc = scan.current;
            const mg = matchGrid.current;
            const toMap = sc ? tf.current.lookup(mapFrame(), sc.header.frame_id) : null;
            onScanMatch(sc && mg && toMap ? scanMatch(mg, scanPointsInMap(sc, toMap)) : null);
        }, 500);
        return () => clearInterval(id);
    }, [scanMatchEnabled, onScanMatch]);

    // Robot pose to the parent, at a UI-friendly rate.
    const lastReported = useRef<string>("");
    useEffect(() => {
        const id = setInterval(() => {
            const pose = tf.current.lookup(mapFrame(), baseFrame);
            const key = pose ? `${pose.x.toFixed(2)},${pose.y.toFixed(2)},${pose.theta.toFixed(2)}` : "none";
            if (key !== lastReported.current) {
                lastReported.current = key;
                onRobotPose?.(pose);
            }
        }, 250);
        return () => clearInterval(id);
    }, [ns, onRobotPose]);

    // --- drawing ---------------------------------------------------------------------
    const drawGrid = (ctx: CanvasRenderingContext2D, layer: GridLayer, dpr: number, alpha = 1) => {
        const s = size.current;
        const v = view.current;
        // Grid frame -> map frame (identity unless the layer is in another frame).
        const toMap = layer.frame === mapFrame() ? { x: 0, y: 0, theta: 0 } : tf.current.lookup(mapFrame(), layer.frame);
        if (!toMap) return;
        const o = transformPoint(toMap, layer.origin);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.imageSmoothingEnabled = false;
        // World (y up) -> screen (y down), in device pixels.
        const k = v.scale * dpr;
        ctx.setTransform(k, 0, 0, -k, (s.width / 2 - v.cx * v.scale) * dpr, (s.height / 2 + v.cy * v.scale) * dpr);
        ctx.translate(o.x, o.y);
        ctx.rotate(normalizeAngle(toMap.theta + layer.origin.theta));
        // Image row 0 is the top of the grid (gridToRgba flips rows).
        ctx.scale(layer.resolution, -layer.resolution);
        ctx.translate(0, -layer.height);
        ctx.drawImage(layer.image, 0, 0);
        ctx.restore();
    };

    const drawArrow = (ctx: CanvasRenderingContext2D, pose: Pose2D, color: string, length = 0.8) => {
        const s = size.current;
        const v = view.current;
        const p = worldToScreen(v, s, pose);
        const tip = worldToScreen(v, s, { x: pose.x + Math.cos(pose.theta) * length, y: pose.y + Math.sin(pose.theta) * length });
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();
        const a = Math.atan2(tip.y - p.y, tip.x - p.x);
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(tip.x - 12 * Math.cos(a - 0.45), tip.y - 12 * Math.sin(a - 0.45));
        ctx.lineTo(tip.x - 12 * Math.cos(a + 0.45), tip.y - 12 * Math.sin(a + 0.45));
        ctx.closePath();
        ctx.fill();
    };

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d")!;
        const s = size.current;
        const v = view.current;
        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = "#0f1216";
        ctx.fillRect(0, 0, s.width, s.height);
        if (mapLayer.current) drawGrid(ctx, mapLayer.current, dpr);
        if (costLayer.current) drawGrid(ctx, costLayer.current, dpr, 0.8);

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Planned path.
        const path = plan.current;
        if (path && path.poses.length > 1) {
            const toMap = path.header.frame_id === mapFrame() || !path.header.frame_id
                ? { x: 0, y: 0, theta: 0 }
                : tf.current.lookup(mapFrame(), path.header.frame_id);
            if (toMap) {
                ctx.strokeStyle = "#2fbf71";
                ctx.lineWidth = 3;
                ctx.beginPath();
                path.poses.forEach((p, i) => {
                    const w = transformPoint(toMap, p.pose.position);
                    const sp = worldToScreen(v, s, w);
                    if (i === 0) ctx.moveTo(sp.x, sp.y);
                    else ctx.lineTo(sp.x, sp.y);
                });
                ctx.stroke();
            }
        }

        // Lidar scan.
        const sc = scan.current;
        if (sc) {
            const toMap = tf.current.lookup(mapFrame(), sc.header.frame_id);
            if (toMap) {
                // Matched points (on a wall of the saved map) green, unmatched red - where the
                // map and the world disagree is visible at a glance. Plain red without a map.
                const mg = scanMatchEnabled ? matchGrid.current : null;
                for (const w of scanPointsInMap(sc, toMap)) {
                    ctx.fillStyle = mg ? (isNearWall(mg, w) ? "#22c55e" : "#ef4444") : "#ff5a5f";
                    const sp = worldToScreen(v, s, w);
                    ctx.fillRect(sp.x - 1.5, sp.y - 1.5, 3, 3);
                }
            }
        }

        // Places.
        ctx.font = "600 12px system-ui, sans-serif";
        for (const m of markers) {
            const sp = worldToScreen(v, s, m.pose);
            const color = m.highlighted ? "#f5b400" : "#c38cff";
            drawArrow(ctx, m.pose, color, 0.5);
            ctx.fillStyle = "rgba(15,18,22,0.8)";
            const w = ctx.measureText(m.label).width + 8;
            ctx.fillRect(sp.x + 8, sp.y - 22, w, 16);
            ctx.fillStyle = color;
            ctx.fillText(m.label, sp.x + 12, sp.y - 10);
        }

        // Robot.
        const robot = tf.current.lookup(mapFrame(), baseFrame);
        if (robot) {
            const h = FOOTPRINT / 2;
            const corners = [[h, h], [h, -h], [-h, -h], [-h, h]].map(([x, y]) => worldToScreen(v, s, transformPoint(robot, { x, y })));
            ctx.fillStyle = "rgba(245, 180, 0, 0.25)";
            ctx.strokeStyle = "#f5b400";
            ctx.lineWidth = 2;
            ctx.beginPath();
            corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            drawArrow(ctx, robot, "#f5b400", 0.7);
        }

        // Drag in progress, or a pose waiting for confirmation.
        const d = drag.current;
        if (d) drawArrow(ctx, d.pose, TOOL_COLOR[d.tool], 1.0);
        else if (pending) drawArrow(ctx, pending.pose, TOOL_COLOR[pending.tool], 1.0);
    }, [markers, pending, ns, scanMatchEnabled]); // draw re-binds when the props it reads change

    // Animation loop: redraw only when something changed.
    useEffect(() => {
        let raf = 0;
        const loop = () => {
            if (follow) {
                const robot = tf.current.lookup(mapFrame(), baseFrame);
                if (robot && (Math.abs(robot.x - view.current.cx) > 1e-3 || Math.abs(robot.y - view.current.cy) > 1e-3)) {
                    view.current = { ...view.current, cx: robot.x, cy: robot.y };
                    dirty.current = true;
                }
            }
            if (!fitted.current && mapLayer.current && size.current.width > 1) {
                const l = mapLayer.current;
                view.current = fitBounds(size.current, {
                    minX: l.origin.x,
                    minY: l.origin.y,
                    maxX: l.origin.x + l.width * l.resolution,
                    maxY: l.origin.y + l.height * l.resolution,
                });
                fitted.current = true;
                dirty.current = true;
            }
            if (dirty.current) {
                dirty.current = false;
                draw();
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [draw, follow]);

    // Canvas size follows its container.
    useEffect(() => {
        const container = containerRef.current;
        const canvas = canvasRef.current;
        if (!container || !canvas) return;
        const observer = new ResizeObserver(() => {
            const rect = container.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            size.current = { width: rect.width, height: rect.height };
            canvas.width = Math.round(rect.width * dpr);
            canvas.height = Math.round(rect.height * dpr);
            canvas.style.width = `${rect.width}px`;
            canvas.style.height = `${rect.height}px`;
            dirty.current = true;
        });
        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    // --- interaction -----------------------------------------------------------------
    const local = (e: { clientX: number; clientY: number }) => {
        const rect = canvasRef.current!.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const hitMarker = (p: { x: number; y: number }) => markers.find((m) => {
        const sp = worldToScreen(view.current, size.current, m.pose);
        return Math.hypot(sp.x - p.x, sp.y - p.y) < 12;
    });

    const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = local(e);
        pointers.current.set(e.pointerId, p);
        if (pointers.current.size > 1) {
            drag.current = null; // second finger: pinch, not a pose
            return;
        }
        if (tool === "pan") {
            const hit = hitMarker(p);
            if (hit) onMarkerClick?.(hit.id);
            return;
        }
        const w = screenToWorld(view.current, size.current, p);
        drag.current = { tool, start: p, pose: { x: w.x, y: w.y, theta: 0 } };
        dirty.current = true;
    };

    const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const prev = pointers.current.get(e.pointerId);
        if (!prev) return;
        const p = local(e);
        const ptrs = pointers.current;
        if (ptrs.size === 2) {
            const [a, b] = [...ptrs.values()];
            const other = a === prev ? b : a;
            const before = Math.hypot(prev.x - other.x, prev.y - other.y);
            const after = Math.hypot(p.x - other.x, p.y - other.y);
            if (before > 0) {
                view.current = zoomAt(view.current, size.current, { x: (p.x + other.x) / 2, y: (p.y + other.y) / 2 }, after / before);
            }
        } else if (drag.current) {
            const d = drag.current;
            const dx = p.x - d.start.x;
            const dy = p.y - d.start.y;
            if (Math.hypot(dx, dy) > 6) d.pose = { ...d.pose, theta: Math.atan2(-dy, dx) };
        } else {
            view.current = panBy(view.current, p.x - prev.x, p.y - prev.y);
        }
        ptrs.set(e.pointerId, p);
        dirty.current = true;
    };

    const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
        pointers.current.delete(e.pointerId);
        const d = drag.current;
        drag.current = null;
        if (d) onPoseDrawn(d.tool, d.pose);
        dirty.current = true;
    };

    const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
        view.current = zoomAt(view.current, size.current, local(e), Math.exp(-e.deltaY * 0.0015));
        dirty.current = true;
    };

    const zoomCentre = (factor: number) => {
        view.current = zoomAt(view.current, size.current, { x: size.current.width / 2, y: size.current.height / 2 }, factor);
        dirty.current = true;
    };

    const fit = () => {
        fitted.current = false;
        dirty.current = true;
    };

    return (
        <div ref={containerRef} className={`map-view map-tool-${tool}`}>
            <canvas
                ref={canvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onWheel={onWheel}
            />
            {!hasMap && (
                <div className="map-empty">
                    <MapIcon size={34} strokeWidth={1.5} />
                    <div>Waiting for a map on {nsName(ns, "map")}…</div>
                </div>
            )}
            {hasMap && scanMatchEnabled && (
                <div className="map-legend" title="Lidar points on a wall of the saved map are green; red points hit free or unknown space">
                    <span><span className="legend-dot" style={{ background: "#22c55e" }} />Scan matches map</span>
                    <span><span className="legend-dot" style={{ background: "#ef4444" }} />No match</span>
                </div>
            )}
            <div className="floating map-zoom">
                <button className="tool-btn" title="Zoom in" onClick={() => zoomCentre(1.4)}><Plus size={18} /></button>
                <button className="tool-btn" title="Zoom out" onClick={() => zoomCentre(1 / 1.4)}><Minus size={18} /></button>
                <button className="tool-btn" title="Fit map" onClick={fit}><Maximize2 size={16} /></button>
            </div>
        </div>
    );
};
