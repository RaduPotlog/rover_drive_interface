import { Map as MapIcon, Maximize2, Minus, Navigation2, Plus, RotateCcw, RotateCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useApp } from "../AppContext";
import { useSubscriptionRef } from "../hooks/useSubscriptionRef";
import { compose, IDENTITY, normalizeAngle, type Pose2D, poseFromRos, transformPoint } from "../lib/geometry";
import { nsFrame, nsName } from "../lib/namespace";
import {
    buildMatchGrid,
    classifyPoint,
    isNearWall,
    type MatchGrid,
    type PointMatch,
    scanMatch,
    type ScanMatch,
} from "../lib/locQuality";
import { gridToRgba, MAP_LEGEND_COLORS, type MapSummary, type OccupancyGrid, summarizeMap } from "../lib/occupancyGrid";
import type { LaserScan, Path, TFMessage } from "../lib/rosTypes";
import { TfBuffer } from "../lib/tf";
import {
    fitBounds,
    headingUpRotation,
    panBy,
    QUARTER_TURN,
    rotateAt,
    screenToWorld,
    type Size,
    snapRotation,
    type View,
    viewMatrix,
    visibleWorldBounds,
    worldToScreen,
    zoomAt,
} from "../lib/view";
import { resolveViewFrame, sameViewFrame, type ViewFrame, type ViewFrameMode } from "../lib/viewFrame";

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

const FOOTPRINT = 0.98; // m, square, padded Nav 2 footprint (bringup.launch.py bounding box)
const ROVER_LENGTH = 0.839; // m, outer wheel edges: wheelbase + 2 * wheel_radius (wheel_01.yaml)
const ROVER_WIDTH = 0.734; // m, wheel_separation + wheel_width
const ROVER_COLOR = "#3b82f6";
const SCAN_COLOR = "#38bdf8"; // live lidar when there is no saved map to match against
const POINT_COLOR: Record<PointMatch, string> = { wall: "#22c55e", new: SCAN_COLOR, conflict: "#ef4444" };
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
    /** With follow: turn the map so the rover's heading points up the screen. */
    headingUp?: boolean;
    /** Name the manual map rotation is remembered under (per viewer), e.g. the map's name. */
    rotationKey?: string;
    onRobotPose?: (pose: Pose2D | null) => void;
    onMapFrame?: (frame: string | null) => void;
    /** Size and coverage of every map message (slam_toolbox grows it while mapping). */
    onMapInfo?: (summary: MapSummary) => void;
    /** Colour scan points by whether they hit the map, and report the share (localization quality). */
    scanMatchEnabled?: boolean;
    /** Matching against the map SLAM is building: unmapped area is "new", not a miss. */
    mapping?: boolean;
    /** Fixed frame to draw in; "auto" falls back to odom when the rover has no map pose. */
    frameMode?: ViewFrameMode;
    /** The frame actually drawn in (goals and poses drawn on the canvas are in it). */
    onViewFrame?: (frame: ViewFrame) => void;
    onScanMatch?: (match: ScanMatch | null) => void;
}

export const MapView = ({
    tool, onPoseDrawn, pending, markers, onMarkerClick, showCostmap, follow, headingUp = false, rotationKey = "default",
    onRobotPose, onMapFrame, onMapInfo, scanMatchEnabled = false, mapping = false, onScanMatch, frameMode = "auto",
    onViewFrame,
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
    const [hasPose, setHasPose] = useState(false);
    const [viewKind, setViewKind] = useState<ViewFrame["kind"]>("map");
    // The map's rotation as last shown by the compass needle (the view itself lives in a ref).
    const [shownRotation, setShownRotation] = useState(0);
    const shownRotationRef = useRef(0);
    const snapTimer = useRef<number | undefined>(undefined);

    // Read through a ref so the draw loop and intervals see a mode change without re-binding.
    const frameModeRef = useRef(frameMode);
    frameModeRef.current = frameMode;
    const viewFrameOf = () => resolveViewFrame(frameModeRef.current, tf.current, ns, mapLayer.current?.frame);
    const mapFrame = () => mapLayer.current?.frame ?? nsFrame(ns, "map");
    /** The fixed frame everything is drawn in (map, or odom when there is no map pose). */
    const fixedFrame = () => viewFrameOf().frame;
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
        onMapInfo?.(summarizeMap(m));
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
    useEffect(markDirty, [pending, markers, tool, frameMode]);

    // Scan-to-map match for the localization-quality indicator, twice a second.
    useEffect(() => {
        if (!scanMatchEnabled || !onScanMatch) return;
        const id = setInterval(() => {
            const sc = scan.current;
            const mg = matchGrid.current;
            // Matching compares the scan with the map grid, so it only means something in the map frame.
            const toMap = sc && viewFrameOf().kind === "map" ? tf.current.lookup(mapFrame(), sc.header.frame_id) : null;
            onScanMatch(sc && mg && toMap ? scanMatch(mg, scanPointsInMap(sc, toMap), { ignoreUnknown: mapping }) : null);
        }, 500);
        return () => clearInterval(id);
    }, [scanMatchEnabled, mapping, onScanMatch]);

    // Robot pose to the parent, at a UI-friendly rate.
    // The view frame is reported the same way; when it changes, the old view centre means
    // nothing in the new frame, so re-centre.
    const lastReported = useRef<string>("");
    const lastFrame = useRef<ViewFrame | null>(null);
    useEffect(() => {
        const report = () => {
            const vf = viewFrameOf();
            if (!sameViewFrame(vf, lastFrame.current)) {
                lastFrame.current = vf;
                fitted.current = false;
                setViewKind(vf.kind);
                onViewFrame?.(vf);
                markDirty();
            }
            const pose = tf.current.lookup(vf.frame, baseFrame);
            setHasPose(pose !== null);
            const key = pose ? `${vf.frame}:${pose.x.toFixed(2)},${pose.y.toFixed(2)},${pose.theta.toFixed(2)}` : "none";
            if (key !== lastReported.current) {
                lastReported.current = key;
                onRobotPose?.(pose);
            }
        };
        report();
        const id = setInterval(report, 250);
        return () => clearInterval(id);
    }, [ns, onRobotPose, onViewFrame, frameMode]);

    // --- drawing ---------------------------------------------------------------------
    const drawGrid = (ctx: CanvasRenderingContext2D, layer: GridLayer, dpr: number, alpha = 1) => {
        const s = size.current;
        const v = view.current;
        // Grid frame -> view frame (identity unless the layer is in another frame).
        const toMap = layer.frame === fixedFrame() ? IDENTITY : tf.current.lookup(fixedFrame(), layer.frame);
        if (!toMap) return;
        const o = transformPoint(toMap, layer.origin);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.imageSmoothingEnabled = false;
        // World (y up) -> screen (y down, turned by the view's rotation), in device pixels.
        ctx.setTransform(...viewMatrix(v, s, dpr));
        ctx.translate(o.x, o.y);
        ctx.rotate(normalizeAngle(toMap.theta + layer.origin.theta));
        // Image row 0 is the top of the grid (gridToRgba flips rows).
        ctx.scale(layer.resolution, -layer.resolution);
        ctx.translate(0, -layer.height);
        ctx.drawImage(layer.image, 0, 0);
        ctx.restore();
    };

    /** Metric reference grid: 1 m lines, every 5th stronger, so odometry-only motion is visible. */
    const drawMetricGrid = (ctx: CanvasRenderingContext2D) => {
        const s = size.current;
        const v = view.current;
        if (v.scale < 4) return; // lines would be closer than 4 px
        // All four corners: once the map is turned, two of them no longer bound what is visible.
        const b = visibleWorldBounds(v, s);
        const line = (x0: number, y0: number, x1: number, y1: number) => {
            const a = worldToScreen(v, s, { x: x0, y: y0 });
            const b = worldToScreen(v, s, { x: x1, y: y1 });
            ctx.moveTo(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5);
            ctx.lineTo(Math.round(b.x) + 0.5, Math.round(b.y) + 0.5);
        };
        ctx.lineWidth = 1;
        for (const major of [false, true]) {
            ctx.strokeStyle = major ? "rgba(255,255,255,0.11)" : "rgba(255,255,255,0.045)";
            ctx.beginPath();
            for (let x = Math.floor(b.minX); x <= Math.ceil(b.maxX); x++) {
                if ((x % 5 === 0) === major) line(x, b.minY, x, b.maxY);
            }
            for (let y = Math.floor(b.minY); y <= Math.ceil(b.maxY); y++) {
                if ((y % 5 === 0) === major) line(b.minX, y, b.maxX, y);
            }
            ctx.stroke();
        }
    };

    /** A place (stored in the map frame) in the view frame, or null when it cannot be placed. */
    const markerPose = (pose: Pose2D): Pose2D | null => {
        const vf = fixedFrame();
        if (vf === mapFrame()) return pose;
        const toView = tf.current.lookup(vf, mapFrame());
        return toView ? compose(toView, pose) : null;
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
        drawMetricGrid(ctx);
        if (mapLayer.current) drawGrid(ctx, mapLayer.current, dpr);
        if (costLayer.current) drawGrid(ctx, costLayer.current, dpr, 0.8);

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Planned path.
        const path = plan.current;
        if (path && path.poses.length > 1) {
            const toMap = path.header.frame_id === fixedFrame() || !path.header.frame_id
                ? IDENTITY
                : tf.current.lookup(fixedFrame(), path.header.frame_id);
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
            const toMap = tf.current.lookup(fixedFrame(), sc.header.frame_id);
            if (toMap) {
                // Matched points (on a wall of the map) green, unmatched red - where the map and
                // the world disagree is visible at a glance. While mapping, points in unmapped
                // area are new ground, so they are a neutral cyan rather than an alarm red.
                const mg = scanMatchEnabled && viewFrameOf().kind === "map" ? matchGrid.current : null;
                for (const w of scanPointsInMap(sc, toMap)) {
                    ctx.fillStyle = !mg ? SCAN_COLOR
                        : mapping ? POINT_COLOR[classifyPoint(mg, w)]
                            : isNearWall(mg, w) ? POINT_COLOR.wall : POINT_COLOR.conflict;
                    const sp = worldToScreen(v, s, w);
                    ctx.fillRect(sp.x - 1.5, sp.y - 1.5, 3, 3);
                }
            }
        }

        // Places.
        ctx.font = "600 12px system-ui, sans-serif";
        for (const m of markers) {
            const pose = markerPose(m.pose);
            if (!pose) continue;
            const sp = worldToScreen(v, s, pose);
            const color = m.highlighted ? "#f5b400" : "#c38cff";
            drawArrow(ctx, pose, color, 0.5);
            ctx.fillStyle = "rgba(15,18,22,0.8)";
            const w = ctx.measureText(m.label).width + 8;
            ctx.fillRect(sp.x + 8, sp.y - 22, w, 16);
            ctx.fillStyle = color;
            ctx.fillText(m.label, sp.x + 12, sp.y - 10);
        }

        // Robot.
        const robot = tf.current.lookup(fixedFrame(), baseFrame);
        if (robot) {
            const drawBox = (hx: number, hy: number, fill: string, stroke: string) => {
                const corners = [[hx, hy], [hx, -hy], [-hx, -hy], [-hx, hy]].map(([x, y]) => worldToScreen(v, s, transformPoint(robot, { x, y })));
                ctx.fillStyle = fill;
                ctx.strokeStyle = stroke;
                ctx.lineWidth = 2;
                ctx.beginPath();
                corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            };
            // Nav 2 footprint (padded), then the rover's real outline inside it.
            drawBox(FOOTPRINT / 2, FOOTPRINT / 2, "rgba(245, 180, 0, 0.25)", "#f5b400");
            drawBox(ROVER_LENGTH / 2, ROVER_WIDTH / 2, "rgba(59, 130, 246, 0.25)", ROVER_COLOR);
            drawArrow(ctx, robot, "#f5b400", 0.7);
        }

        // Drag in progress, or a pose waiting for confirmation.
        const d = drag.current;
        if (d) drawArrow(ctx, d.pose, TOOL_COLOR[d.tool], 1.0);
        else if (pending) drawArrow(ctx, pending.pose, TOOL_COLOR[pending.tool], 1.0);
    }, [markers, pending, ns, scanMatchEnabled, mapping]); // draw re-binds when the props it reads change

    // Animation loop: redraw only when something changed.
    useEffect(() => {
        let raf = 0;
        const loop = () => {
            if (follow) {
                const robot = tf.current.lookup(fixedFrame(), baseFrame);
                if (robot && (Math.abs(robot.x - view.current.cx) > 1e-3 || Math.abs(robot.y - view.current.cy) > 1e-3)) {
                    view.current = { ...view.current, cx: robot.x, cy: robot.y };
                    dirty.current = true;
                }
                if (robot && headingUp) {
                    const r = headingUpRotation(robot.theta);
                    if (Math.abs(normalizeAngle(r - (view.current.rotation ?? 0))) > 1e-3) {
                        view.current = { ...view.current, rotation: r };
                        dirty.current = true;
                    }
                }
            }
            if (!fitted.current && size.current.width > 1) {
                const l = mapLayer.current;
                if (l && l.frame === fixedFrame()) {
                    view.current = fitBounds(size.current, {
                        minX: l.origin.x,
                        minY: l.origin.y,
                        maxX: l.origin.x + l.width * l.resolution,
                        maxY: l.origin.y + l.height * l.resolution,
                    }, 0.05, view.current.rotation ?? 0);
                    fitted.current = true;
                    dirty.current = true;
                } else {
                    // No map in this frame (odom view): centre on the rover once it is known.
                    const robot = tf.current.lookup(fixedFrame(), baseFrame);
                    if (robot) {
                        view.current = { ...view.current, cx: robot.x, cy: robot.y };
                        fitted.current = true;
                        dirty.current = true;
                    }
                }
            }
            if (dirty.current) {
                dirty.current = false;
                draw();
                // The compass needle re-renders only when the angle moved visibly (~0.5 deg).
                const r = view.current.rotation ?? 0;
                if (Math.abs(normalizeAngle(r - shownRotationRef.current)) > 0.01) {
                    shownRotationRef.current = r;
                    setShownRotation(r);
                }
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [draw, follow, headingUp]);

    // Manual rotation is remembered per map (per viewer; heading-up is never stored). Restored
    // when the map changes, and when heading-up is switched off.
    const rotationStorageKey = `map.rotation.${rotationKey}`;
    useEffect(() => {
        if (headingUp) return;
        let r = 0;
        try {
            const stored = Number(localStorage.getItem(rotationStorageKey));
            if (Number.isFinite(stored)) r = snapRotation(stored);
        } catch {
            // per-viewer convenience only
        }
        view.current = { ...view.current, rotation: r };
        dirty.current = true;
    }, [rotationStorageKey, headingUp]);

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

    const centre = () => ({ x: size.current.width / 2, y: size.current.height / 2 });

    const saveRotation = () => {
        try {
            localStorage.setItem(rotationStorageKey, String(view.current.rotation ?? 0));
        } catch {
            // per-viewer convenience only
        }
    };

    /** Turn the map by `dAngle` [rad, counter-clockwise] around `anchor`. Heading-up owns the angle. */
    const rotateBy = (anchor: { x: number; y: number }, dAngle: number) => {
        if (headingUp) return;
        view.current = rotateAt(view.current, size.current, anchor, dAngle);
        dirty.current = true;
    };

    /** Settle a gesture: snap onto a quarter turn when close, then remember the angle. */
    const settleRotation = (anchor: { x: number; y: number }) => {
        if (headingUp) return;
        const r = view.current.rotation ?? 0;
        rotateBy(anchor, snapRotation(r) - r);
        saveRotation();
    };

    /** Rotate buttons: a quarter turn from the nearest quarter, so a free angle lands on the grid. */
    const quarterTurn = (direction: 1 | -1) => {
        const r = view.current.rotation ?? 0;
        const target = Math.round(r / QUARTER_TURN) * QUARTER_TURN + direction * QUARTER_TURN;
        rotateBy(centre(), normalizeAngle(target - r));
        saveRotation();
    };

    const mapUp = () => {
        rotateBy(centre(), -(view.current.rotation ?? 0));
        saveRotation();
    };

    const hitMarker = (p: { x: number; y: number }) => markers.find((m) => {
        const pose = markerPose(m.pose);
        if (!pose) return false;
        const sp = worldToScreen(view.current, size.current, pose);
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
            const mid = { x: (p.x + other.x) / 2, y: (p.y + other.y) / 2 };
            if (before > 0) {
                view.current = zoomAt(view.current, size.current, mid, after / before);
                // Twist: the line between the fingers turned by this much (screen y is down, so a
                // clockwise twist on screen is a negative turn of the map).
                const turned = normalizeAngle(Math.atan2(p.y - other.y, p.x - other.x) - Math.atan2(prev.y - other.y, prev.x - other.x));
                rotateBy(mid, -turned);
            }
        } else if (drag.current) {
            const d = drag.current;
            const dx = p.x - d.start.x;
            const dy = p.y - d.start.y;
            // Screen angle -> view-frame angle: undo the map's rotation.
            if (Math.hypot(dx, dy) > 6) d.pose = { ...d.pose, theta: normalizeAngle(Math.atan2(-dy, dx) - (view.current.rotation ?? 0)) };
        } else {
            view.current = panBy(view.current, p.x - prev.x, p.y - prev.y);
        }
        ptrs.set(e.pointerId, p);
        dirty.current = true;
    };

    const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const twisting = pointers.current.size === 2;
        pointers.current.delete(e.pointerId);
        if (twisting) settleRotation(centre());
        const d = drag.current;
        drag.current = null;
        if (d) onPoseDrawn(d.tool, d.pose);
        dirty.current = true;
    };

    const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
        if (e.shiftKey) {
            // Shift + wheel turns the map. Some browsers report a shifted wheel as horizontal.
            const delta = e.deltaY || e.deltaX;
            const anchor = local(e);
            rotateBy(anchor, -delta * 0.003);
            window.clearTimeout(snapTimer.current);
            snapTimer.current = window.setTimeout(() => settleRotation(anchor), 300);
            return;
        }
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
            {!hasMap && !hasPose && (
                <div className="map-empty">
                    <MapIcon size={34} strokeWidth={1.5} />
                    <div>Waiting for a map on {nsName(ns, "map")}…</div>
                </div>
            )}
            {viewKind === "odom" && (
                <div className="map-legend map-odom-badge" title="The rover is drawn from wheel/IMU odometry only (no map -> odom transform). Position drifts over distance; the grid is 1 m.">
                    <span><span className="legend-dot" style={{ background: "#f5b400" }} />Odom frame - no map localization, drift accumulates · grid 1 m</span>
                </div>
            )}
            {viewKind === "map" && hasMap && scanMatchEnabled && mapping && (
                <div className="map-legend" title="Lidar points on a mapped wall are green, in unmapped area cyan, and on mapped free space red: there the scan and the map disagree">
                    <span><span className="legend-dot" style={{ background: MAP_LEGEND_COLORS.free }} />Free</span>
                    <span><span className="legend-dot legend-dot-outline" style={{ background: MAP_LEGEND_COLORS.wall }} />Wall</span>
                    <span><span className="legend-dot legend-dot-outline" style={{ background: MAP_LEGEND_COLORS.unknown }} />Unexplored</span>
                    <span className="legend-sep" />
                    <span><span className="legend-dot" style={{ background: POINT_COLOR.wall }} />Match</span>
                    <span><span className="legend-dot" style={{ background: POINT_COLOR.new }} />New</span>
                    <span><span className="legend-dot" style={{ background: POINT_COLOR.conflict }} />Conflict</span>
                </div>
            )}
            {viewKind === "map" && hasMap && scanMatchEnabled && !mapping && (
                <div className="map-legend" title="Lidar points on a wall of the saved map are green; red points hit free or unknown space">
                    <span><span className="legend-dot" style={{ background: "#22c55e" }} />Scan matches map</span>
                    <span><span className="legend-dot" style={{ background: "#ef4444" }} />No match</span>
                </div>
            )}
            {viewKind === "map" && hasMap && !scanMatchEnabled && (
                <div className="map-legend" title="Gray is map area the lidar has not seen yet; it fills in as the rover drives">
                    <span><span className="legend-dot" style={{ background: MAP_LEGEND_COLORS.free }} />Free</span>
                    <span><span className="legend-dot legend-dot-outline" style={{ background: MAP_LEGEND_COLORS.wall }} />Wall</span>
                    <span><span className="legend-dot legend-dot-outline" style={{ background: MAP_LEGEND_COLORS.unknown }} />Unexplored</span>
                    <span><span className="legend-dot" style={{ background: SCAN_COLOR }} />Lidar</span>
                </div>
            )}
            <div className="floating map-zoom">
                <button className="tool-btn" title="Zoom in" onClick={() => zoomCentre(1.4)}><Plus size={18} /></button>
                <button className="tool-btn" title="Zoom out" onClick={() => zoomCentre(1 / 1.4)}><Minus size={18} /></button>
                <button className="tool-btn" title={viewKind === "odom" ? "Centre on the rover" : "Fit map"} onClick={fit}><Maximize2 size={16} /></button>
                <span className="map-zoom-sep" />
                <button className="tool-btn" disabled={headingUp} onClick={() => quarterTurn(1)}
                    title={headingUp ? "Heading up turns the map" : "Turn the map 90° left (Shift + wheel or two-finger twist turns freely)"}>
                    <RotateCcw size={16} />
                </button>
                <button className="tool-btn" disabled={headingUp} onClick={() => quarterTurn(-1)}
                    title={headingUp ? "Heading up turns the map" : "Turn the map 90° right"}>
                    <RotateCw size={16} />
                </button>
                <button className={`tool-btn map-up-btn ${Math.abs(shownRotation) < 0.01 ? "map-up-idle" : ""}`}
                    disabled={headingUp} onClick={mapUp} aria-label="Map up"
                    title={headingUp
                        ? "Heading up turns the map"
                        : `Map up - the arrow is the map's +Y axis${Math.abs(shownRotation) < 0.01 ? "" : `, turned ${Math.round(Math.abs(shownRotation * 180) / Math.PI)}° ${shownRotation > 0 ? "left" : "right"}; click to reset`}. It is north only when the map is GPS-aligned.`}>
                    <Navigation2 size={16} style={{ transform: `rotate(${-shownRotation}rad)` }} />
                </button>
            </div>
        </div>
    );
};
