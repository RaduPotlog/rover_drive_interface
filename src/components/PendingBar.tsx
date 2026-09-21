import { Check, Flag, MapPin, Star, X } from "lucide-react";
import { type ReactNode, useState } from "react";

import type { Pose2D } from "../lib/geometry";
import type { MapTool } from "./MapView";

const ICONS: Record<MapTool, ReactNode> = {
    pan: null,
    setPose: <MapPin size={16} />,
    goTo: <Flag size={16} />,
    place: <Star size={16} />,
};

const TITLES: Record<MapTool, string> = {
    pan: "",
    setPose: "Set the rover's pose here?",
    goTo: "Send the rover here?",
    place: "Save this place",
};

export const PendingBar = ({ tool, pose, busy, error, onConfirm, onCancel }: {
    tool: MapTool;
    pose: Pose2D;
    busy: boolean;
    error: string | null;
    onConfirm: (name: string) => void;
    onCancel: () => void;
}) => {
    const [name, setName] = useState("");
    const needsName = tool === "place";
    return (
        <div className="pending-bar">
            <div>
                <div className="pending-title">{ICONS[tool]}{TITLES[tool]}</div>
                <div className="mono muted">
                    x {pose.x.toFixed(2)} · y {pose.y.toFixed(2)} · θ {(pose.theta * 180 / Math.PI).toFixed(0)}°
                </div>
                {error && <div className="error-text">{error}</div>}
            </div>
            {needsName && (
                <input
                    autoFocus
                    className="text-input"
                    placeholder="Place name"
                    value={name}
                    maxLength={64}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) onConfirm(name.trim()) }}
                />
            )}
            <div className="pending-actions">
                <button
                    className="btn btn-primary"
                    disabled={busy || (needsName && !name.trim())}
                    onClick={() => onConfirm(name.trim())}
                >
                    <Check size={15} />{tool === "goTo" ? "Go" : tool === "setPose" ? "Set pose" : "Save"}
                </button>
                <button className="btn" onClick={onCancel}><X size={15} />Cancel</button>
            </div>
        </div>
    );
};
