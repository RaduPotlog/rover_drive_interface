import { useState } from "react";

import type { IndoorNav } from "../hooks/useIndoorNav";
import type { Pose2D } from "../lib/geometry";
import { LOCALIZATION_LABEL, LOCALIZATION_MODE } from "../lib/rosTypes";
import type { Level } from "../lib/status";
import { MAP_NAME } from "../lib/workflow";
import { StatusChip } from "./StatusChip";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const modeLevel = (mode: number | undefined): Level =>
    mode === LOCALIZATION_MODE.LOCALIZATION ? "ok"
        : mode === LOCALIZATION_MODE.MAPPING ? "warn"
            : mode === LOCALIZATION_MODE.SWITCHING ? "stale" : "error";

/** Maps: record a new one with SLAM, save it, load a saved one for AMCL, delete. */
export const FacilityPanel = ({ indoor }: { indoor: IndoorNav; robotPose: Pose2D | null }) => {
    const [name, setName] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);
    const mode = indoor.state?.mode;
    const mapping = mode === LOCALIZATION_MODE.MAPPING;
    const switching = mode === LOCALIZATION_MODE.SWITCHING;

    const run = async (fn: () => Promise<{ message: string }>) => {
        setBusy(true);
        setError(null);
        setInfo(null);
        try {
            setInfo((await fn()).message);
        } catch (e) {
            setError(errorText(e));
        } finally {
            setBusy(false);
        }
    };

    if (!indoor.available) {
        return (
            <section className="panel">
                <h3>Facility</h3>
                <p className="hint">
                    Mapping and saved maps need rover_indoor_nav_manager: set ROVER_LOCALIZATION_SOURCE=indoor
                    (and ROVER_START_NAVIGATION=true) on the orchestrator.
                </p>
            </section>
        );
    }

    const nameValid = MAP_NAME.test(name);
    const maps = indoor.maps?.maps ?? [];

    return (
        <section className="panel">
            <h3>Facility</h3>
            <div className="nav-status">
                <StatusChip level={modeLevel(mode)} label={LOCALIZATION_LABEL[mode ?? 0]} />
                {indoor.state?.map_name && <span className="muted">{indoor.state.map_name}</span>}
            </div>
            {indoor.state?.message && <p className="hint">{indoor.state.message}</p>}

            {mapping ? (
                <>
                    <p className="hint rec"><span className="rec-dot" /> REC: drive the rover (Manual) to cover the area.</p>
                    <div className="inline-form">
                        <input
                            className="text-input"
                            placeholder="Map name (letters, digits, _ -)"
                            value={name}
                            maxLength={64}
                            onChange={(e) => setName(e.target.value)}
                        />
                        <button className="btn btn-primary" disabled={!nameValid || busy} onClick={() => run(() => indoor.saveMap(name))}>
                            Save map
                        </button>
                    </div>
                    {name && !nameValid && <p className="hint error-text">Use 1–64 letters, digits, “_” or “-”.</p>}
                </>
            ) : (
                <button
                    className="btn btn-wide"
                    disabled={busy || switching}
                    onClick={() => window.confirm("Start a new map? Localization on the current map stops until you load a map again.")
                        && run(() => indoor.startMapping())}
                >
                    ⏺ Start mapping
                </button>
            )}

            <h3 className="subhead">Saved maps</h3>
            {maps.length === 0 && <p className="hint">No saved maps yet.</p>}
            <ul className="place-list">
                {maps.map((m) => {
                    const active = mode === LOCALIZATION_MODE.LOCALIZATION && indoor.state?.map_name === m.name;
                    const justSaved = mapping && indoor.state?.map_name === m.name;
                    return (
                        <li key={m.name} className={active ? "place-highlighted" : ""}>
                            <span className="place-name" title={`${m.width}×${m.height} @ ${m.resolution.toFixed(2)} m`}>
                                {m.name}
                                <span className="muted small">
                                    {" "}{(m.width * m.resolution).toFixed(0)}×{(m.height * m.resolution).toFixed(0)} m
                                    {m.saved.sec ? ` · ${new Date(m.saved.sec * 1000).toLocaleDateString()}` : ""}
                                </span>
                            </span>
                            <span className="place-actions">
                                {active ? (
                                    <span className="chip chip-ok">in use</span>
                                ) : (
                                    <button
                                        className="btn btn-small btn-primary"
                                        disabled={busy || switching}
                                        title={justSaved ? "Switch to AMCL; the rover keeps its SLAM pose" : "Localize on this map at the last known pose (use Set pose if the rover was moved)"}
                                        onClick={() => run(() => indoor.loadMap(m.name))}
                                    >
                                        Load
                                    </button>
                                )}
                                {!active && (
                                    <button
                                        className="btn btn-small"
                                        disabled={busy}
                                        onClick={() => window.confirm(`Delete map “${m.name}” and its places?`) && run(() => indoor.deleteMap(m.name))}
                                    >
                                        🗑
                                    </button>
                                )}
                            </span>
                        </li>
                    );
                })}
            </ul>
            {mode === LOCALIZATION_MODE.LOCALIZATION && (
                <>
                    <h3 className="subhead">Lost?</h3>
                    <p className="hint">
                        If the rover's outline does not match the walls, use “📍 Set pose” on the map. If you don't
                        know where it is (moved while off), let AMCL search the whole map:
                    </p>
                    <button
                        className="btn btn-wide"
                        disabled={busy}
                        onClick={() => window.confirm(
                            "Search the whole map for the rover? Its current position estimate is discarded. "
                            + "Afterwards drive a few metres slowly in Manual and check the outline matches the walls - "
                            + "in corridors or repeated bays it can pick a look-alike spot; use Set pose then.")
                            && run(() => indoor.findMe())}
                    >
                        🔍 Find me
                    </button>
                </>
            )}
            {info && <p className="hint">{info}</p>}
            {error && <p className="hint error-text">{error}</p>}
        </section>
    );
};
