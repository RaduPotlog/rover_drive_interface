import { Compass, Flag, Hand, Layers, LocateFixed, MapPin, Navigation, Star } from "lucide-react";
import type { ReactNode } from "react";

import { nextViewFrameMode, type ViewFrame, type ViewFrameMode } from "../lib/viewFrame";
import type { MapTool } from "./MapView";

const FRAME_LABEL: Record<ViewFrameMode, string> = { auto: "Auto", map: "Map", odom: "Odom" };
const FRAME_TITLE: Record<ViewFrameMode, string> = {
    auto: "Map frame when the rover is localized, odometry otherwise",
    map: "Always the map frame (needs map -> odom from AMCL/SLAM/GPS)",
    odom: "Always the odom frame: wheel/IMU odometry, drifts over distance",
};

const TOOLS: { id: MapTool; label: string; icon: ReactNode; title: string }[] = [
    { id: "pan", label: "Pan", icon: <Hand size={16} />, title: "Pan and zoom the map" },
    { id: "setPose", label: "Set pose", icon: <MapPin size={16} />, title: "Click where the rover is and drag its heading (re-localize AMCL)" },
    { id: "goTo", label: "Go to", icon: <Flag size={16} />, title: "Click a destination and drag the final heading" },
    { id: "place", label: "Add place", icon: <Star size={16} />, title: "Click and drag to save a named place" },
];

export const MapToolbar = ({
    tool, setTool, disabledTools, follow, setFollow, headingUp, setHeadingUp, showCostmap, setShowCostmap, frameMode,
    setFrameMode, viewFrame,
}: {
    tool: MapTool;
    setTool: (t: MapTool) => void;
    disabledTools: Partial<Record<MapTool, string>>;
    follow: boolean;
    setFollow: (v: boolean) => void;
    headingUp: boolean;
    setHeadingUp: (v: boolean) => void;
    showCostmap: boolean;
    setShowCostmap: (v: boolean) => void;
    frameMode: ViewFrameMode;
    setFrameMode: (m: ViewFrameMode) => void;
    /** The frame actually drawn in, shown when Auto picked it. */
    viewFrame: ViewFrame | null;
}) => (
    <div className="map-toolbar">
        <div className="floating" role="toolbar" aria-label="Map tools">
            {TOOLS.map((t) => (
                <button
                    key={t.id}
                    className={`tool-btn ${tool === t.id ? "tool-on" : ""}`}
                    title={disabledTools[t.id] ?? t.title}
                    disabled={Boolean(disabledTools[t.id])}
                    onClick={() => setTool(t.id)}
                >
                    {t.icon}
                    <span>{t.label}</span>
                </button>
            ))}
        </div>
        <div className="floating">
            <button className={`tool-btn ${follow ? "toggle-on" : ""}`} onClick={() => setFollow(!follow)}
                title="Keep the rover centred" aria-pressed={follow}>
                <LocateFixed size={16} /><span>Follow</span>
            </button>
            <button className={`tool-btn ${headingUp ? "toggle-on" : ""}`} onClick={() => setHeadingUp(!headingUp)}
                title="Turn the map so the rover always points up (also follows the rover). Joystick forward is then screen up."
                aria-pressed={headingUp}>
                <Navigation size={16} /><span>Heading up</span>
            </button>
            <button className={`tool-btn ${showCostmap ? "toggle-on" : ""}`} onClick={() => setShowCostmap(!showCostmap)}
                title="Overlay Nav 2's global costmap" aria-pressed={showCostmap}>
                <Layers size={16} /><span>Costmap</span>
            </button>
            <button className={`tool-btn ${viewFrame?.kind === "odom" ? "toggle-on" : ""}`} onClick={() => setFrameMode(nextViewFrameMode(frameMode))}
                title={`View frame: ${FRAME_TITLE[frameMode]}${viewFrame ? `\nDrawing in ${viewFrame.frame}` : ""}\nClick to cycle Auto / Map / Odom`}>
                <Compass size={16} />
                <span>{FRAME_LABEL[frameMode]}{frameMode === "auto" && viewFrame ? ` · ${FRAME_LABEL[viewFrame.kind]}` : ""}</span>
            </button>
        </div>
    </div>
);
