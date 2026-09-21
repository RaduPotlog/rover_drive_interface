import { Flag, Hand, Layers, LocateFixed, MapPin, Star } from "lucide-react";
import type { ReactNode } from "react";

import type { MapTool } from "./MapView";

const TOOLS: { id: MapTool; label: string; icon: ReactNode; title: string }[] = [
    { id: "pan", label: "Pan", icon: <Hand size={16} />, title: "Pan and zoom the map" },
    { id: "setPose", label: "Set pose", icon: <MapPin size={16} />, title: "Click where the rover is and drag its heading (re-localize AMCL)" },
    { id: "goTo", label: "Go to", icon: <Flag size={16} />, title: "Click a destination and drag the final heading" },
    { id: "place", label: "Add place", icon: <Star size={16} />, title: "Click and drag to save a named place" },
];

export const MapToolbar = ({ tool, setTool, disabledTools, follow, setFollow, showCostmap, setShowCostmap }: {
    tool: MapTool;
    setTool: (t: MapTool) => void;
    disabledTools: Partial<Record<MapTool, string>>;
    follow: boolean;
    setFollow: (v: boolean) => void;
    showCostmap: boolean;
    setShowCostmap: (v: boolean) => void;
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
            <button className={`tool-btn ${showCostmap ? "toggle-on" : ""}`} onClick={() => setShowCostmap(!showCostmap)}
                title="Overlay Nav 2's global costmap" aria-pressed={showCostmap}>
                <Layers size={16} /><span>Costmap</span>
            </button>
        </div>
    </div>
);
