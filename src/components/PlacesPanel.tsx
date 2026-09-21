import { ArrowDown, ArrowUp, ListOrdered, MapPinned, Pencil, Play, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { useApp } from "../AppContext";
import type { IndoorNav } from "../hooks/useIndoorNav";
import type { Pose2D } from "../lib/geometry";
import { LOCALIZATION_MODE, type PlaceMsg } from "../lib/rosTypes";
import { moveStep, removeStep, resolveWorkflow, workflowLabel } from "../lib/workflow";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const workflowKey = (map: string) => `drive.workflow.${map}`;

const loadWorkflow = (map: string): string[] => {
    try {
        const raw = localStorage.getItem(workflowKey(map));
        const ids = raw ? JSON.parse(raw) : [];
        return Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : [];
    } catch {
        return [];
    }
};

/**
 * Places ("endpoints") of the loaded map: go to one, rename/delete, save the rover's current
 * pose, and chain places into an A-B-C workflow run as one mission.
 */
export const PlacesPanel = ({ indoor, robotPose, onGo, highlighted, setHighlighted }: {
    indoor: IndoorNav;
    robotPose: Pose2D | null;
    onGo: (steps: PlaceMsg[], label: string) => Promise<void>;
    highlighted: string | null;
    setHighlighted: (id: string | null) => void;
}) => {
    const { driveMode } = useApp();
    const localized = indoor.state?.mode === LOCALIZATION_MODE.LOCALIZATION;
    const mapName = indoor.state?.map_name ?? "";
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
    const [newName, setNewName] = useState("");
    const [workflow, setWorkflow] = useState<string[]>(() => loadWorkflow(mapName));

    // The workflow is a per-viewer draft, kept per map in this browser only.
    useEffect(() => setWorkflow(loadWorkflow(mapName)), [mapName]);
    useEffect(() => {
        try {
            localStorage.setItem(workflowKey(mapName), JSON.stringify(workflow));
        } catch {
            // private mode etc.: the draft just is not remembered
        }
    }, [mapName, workflow]);

    const run = async (fn: () => Promise<unknown>) => {
        setBusy(true);
        setError(null);
        try {
            await fn();
        } catch (e) {
            setError(errorText(e));
        } finally {
            setBusy(false);
        }
    };

    if (!indoor.available) {
        return (
            <section className="card">
                <div className="card-head"><h3 className="card-title"><MapPinned size={15} />Places</h3></div>
                <p className="hint">
                    Places need rover_indoor_nav_manager (ROVER_LOCALIZATION_SOURCE=indoor on the orchestrator).
                </p>
            </section>
        );
    }

    const steps = resolveWorkflow(workflow, indoor.places);
    const canDrive = localized && driveMode === "neutral" && !busy;

    return (
        <section className="card">
            <div className="card-head">
                <h3 className="card-title"><MapPinned size={15} />Places</h3>
                {mapName && <span className="chip chip-unknown">{mapName}</span>}
            </div>
            {!localized && <p className="hint">Load a map in Facility to use places.</p>}
            {localized && indoor.places.length === 0 && (
                <p className="hint">No places yet. Use “Add place” on the map, or save where the rover is now.</p>
            )}
            <ul className="place-list">
                {indoor.places.map((p) => (
                    <li
                        key={p.id}
                        className={highlighted === p.id ? "place-highlighted" : ""}
                        onMouseEnter={() => setHighlighted(p.id)}
                        onMouseLeave={() => setHighlighted(null)}
                    >
                        {editing?.id === p.id ? (
                            <input
                                className="text-input place-name-input"
                                autoFocus
                                value={editing.name}
                                maxLength={64}
                                onChange={(e) => setEditing({ id: p.id, name: e.target.value })}
                                onKeyDown={(e) => {
                                    if (e.key === "Escape") setEditing(null);
                                    if (e.key === "Enter" && editing.name.trim()) {
                                        run(async () => {
                                            await indoor.savePlace({ ...p, name: editing.name.trim() });
                                            setEditing(null);
                                        });
                                    }
                                }}
                            />
                        ) : (
                            <span className="place-name" title={`x ${p.x.toFixed(2)} · y ${p.y.toFixed(2)}`}>{p.name}</span>
                        )}
                        <span className="place-actions">
                            <button className="btn btn-small btn-primary" disabled={!canDrive} onClick={() => run(() => onGo([p], p.name))}><Play size={13} />Go</button>
                            <button className="btn btn-small" title="Add to workflow" disabled={!localized} onClick={() => setWorkflow([...workflow, p.id])}><Plus size={14} /></button>
                            <button className="btn btn-small" title="Rename" onClick={() => setEditing({ id: p.id, name: p.name })}><Pencil size={13} /></button>
                            <button
                                className="btn btn-small"
                                title="Delete"
                                onClick={() => window.confirm(`Delete place “${p.name}”?`) && run(() => indoor.deletePlace(p.id))}
                            >
                                <Trash2 size={13} />
                            </button>
                        </span>
                    </li>
                ))}
            </ul>

            {localized && (
                <div className="inline-form">
                    <input
                        className="text-input"
                        placeholder="Name for the rover's current pose"
                        value={newName}
                        maxLength={64}
                        onChange={(e) => setNewName(e.target.value)}
                    />
                    <button
                        className="btn"
                        disabled={!newName.trim() || !robotPose || busy}
                        title={robotPose ? "" : "Not localized"}
                        onClick={() => run(async () => {
                            await indoor.savePlace({ id: "", name: newName.trim(), x: robotPose!.x, y: robotPose!.y, theta: robotPose!.theta });
                            setNewName("");
                        })}
                    >
                        Save here
                    </button>
                </div>
            )}

            <h3 className="card-title subhead"><ListOrdered size={15} />Workflow</h3>
            {steps.length === 0 ? (
                <p className="hint">Add places with + to visit them in order (A → B → C).</p>
            ) : (
                <ol className="workflow-list">
                    {steps.map((p, i) => (
                        <li key={`${p.id}-${i}`}>
                            <span className="place-name">{p.name}</span>
                            <span className="place-actions">
                                <button className="btn btn-small" onClick={() => setWorkflow(moveStep(workflow, i, -1))} disabled={i === 0}><ArrowUp size={13} /></button>
                                <button className="btn btn-small" onClick={() => setWorkflow(moveStep(workflow, i, 1))} disabled={i === steps.length - 1}><ArrowDown size={13} /></button>
                                <button className="btn btn-small" onClick={() => setWorkflow(removeStep(workflow, i))}><X size={13} /></button>
                            </span>
                        </li>
                    ))}
                </ol>
            )}
            <div className="inline-form">
                <button
                    className="btn btn-primary"
                    disabled={!canDrive || steps.length === 0}
                    onClick={() => run(() => onGo(steps, workflowLabel(steps)))}
                >
                    <Play size={15} />Run workflow
                </button>
                <button className="btn" disabled={workflow.length === 0} onClick={() => setWorkflow([])}>Clear</button>
            </div>
            {driveMode === "manual" && <p className="hint">Switch to Neutral to send the rover somewhere.</p>}
            {error && <p className="hint error-text">{error}</p>}
        </section>
    );
};
