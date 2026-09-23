import { Activity, Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";

import { useDiagnostics } from "../../hooks/useDiagnostics";
import { useRos } from "../../ros/RosProvider";
import { Modal } from "../Modal";
import { DiagnosticsIssues } from "./DiagnosticsIssues";
import { DiagnosticsTimeline } from "./DiagnosticsTimeline";
import { DiagnosticsTree } from "./DiagnosticsTree";

/**
 * The same view as Cockpit's "ROS 2 Diagnostics" page, over the same diagnostics_agg topic:
 * a 30-snapshot timeline, the Errors and Warnings cards, and the full tree.
 *
 * Cockpit's "Capture Diagnostics" card is not here: it shells out on the robot (dmesg,
 * journalctl, ros2 doctor) through Cockpit's privileged API, and this page's only back
 * channel is the foxglove websocket. Capture stays in Cockpit.
 */
export const DiagnosticsModal = ({ onClose }: { onClose: () => void }) => {
    const { connected } = useRos();
    const { latest, history, paused, setPaused, clearHistory } = useDiagnostics();
    // -1 is the newest snapshot; only meaningful while paused.
    const [negIndex, setNegIndex] = useState(-1);
    const [selectedRawName, setSelectedRawName] = useState<string | null>(null);

    // Leaving the popup paused would silently freeze the history for the pill as well.
    useEffect(() => () => setPaused(false), [setPaused]);

    useEffect(() => {
        if (!paused) setNegIndex(-1);
    }, [paused, history]);

    const displayed = paused ? history[history.length + negIndex] ?? null : latest;
    const tree = displayed?.tree ?? [];

    const togglePause = () => {
        if (paused) {
            // Resuming: the frozen buffer is stale next to live, so start the strip over.
            clearHistory();
            setPaused(false);
        } else {
            setPaused(true);
        }
    };

    return (
        <Modal
            onClose={onClose}
            title="ROS 2 Diagnostics"
            icon={<Activity size={16} />}
            wide
            actions={(
                <button type="button" className="btn btn-small" onClick={togglePause}>
                    {paused ? <Play size={14} /> : <Pause size={14} />}
                    {paused ? "Resume" : "Pause"}
                </button>
            )}
        >
            <DiagnosticsTimeline
                history={history}
                negIndex={negIndex}
                paused={paused}
                onSelect={(index) => {
                    setPaused(true);
                    setNegIndex(index - history.length);
                }}
            />
            <DiagnosticsIssues
                tree={tree}
                variant="error"
                selectedRawName={selectedRawName}
                onSelect={setSelectedRawName}
            />
            <DiagnosticsIssues
                tree={tree}
                variant="warning"
                selectedRawName={selectedRawName}
                onSelect={setSelectedRawName}
            />
            <DiagnosticsTree
                tree={tree}
                connected={connected}
                selectedRawName={selectedRawName}
                onSelect={setSelectedRawName}
            />
        </Modal>
    );
};
