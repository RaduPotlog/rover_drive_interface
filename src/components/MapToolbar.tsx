import type { MapTool } from "./MapView";

const TOOLS: { id: MapTool; label: string; title: string }[] = [
    { id: "pan", label: "✋ Pan", title: "Pan and zoom the map" },
    { id: "setPose", label: "📍 Set pose", title: "Click where the rover is and drag its heading (re-localize AMCL)" },
    { id: "goTo", label: "🏁 Go to", title: "Click a destination and drag the final heading" },
    { id: "place", label: "⭐ Add place", title: "Click and drag to save a named place" },
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
        {TOOLS.map((t) => (
            <button
                key={t.id}
                className={`btn btn-small ${tool === t.id ? "btn-selected" : ""}`}
                title={disabledTools[t.id] ?? t.title}
                disabled={Boolean(disabledTools[t.id])}
                onClick={() => setTool(t.id)}
            >
                {t.label}
            </button>
        ))}
        <span className="toolbar-sep" />
        <label className="toggle" title="Keep the rover centred">
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow
        </label>
        <label className="toggle" title="Overlay Nav 2's global costmap">
            <input type="checkbox" checked={showCostmap} onChange={(e) => setShowCostmap(e.target.checked)} /> Costmap
        </label>
    </div>
);
