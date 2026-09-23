import { CircuitBoard, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { useApp } from "../AppContext";
import { useServiceCall } from "../hooks/useService";
import { useNow } from "../hooks/useTopic";
import { AUX_COUNT, type AuxIoSummary, type AuxRequest, auxPin, auxRequestSettled, auxRowState } from "../lib/auxIo";
import { nsName } from "../lib/namespace";
import { Modal } from "./Modal";

interface SetBoolResponse { success: boolean; message: string }

const OutputRow = ({ index, name, readBack, canWrite, reason }: {
    index: number;
    name: string;
    readBack: boolean | null;
    canWrite: boolean;
    reason: string;
}) => {
    const { config } = useApp();
    const { call } = useServiceCall<{ data: boolean }, SetBoolResponse>(
        nsName(config.namespace, `hardware_interface/aux_output_${index}/set`), 3000);
    const [request, setRequest] = useState<AuxRequest | null>(null);
    const [error, setError] = useState<string | null>(null);
    const now = useNow(250);

    // Once the PLC confirms a switch, the read-back alone drives the row again. Keeping the request
    // would flag a mismatch later for a change made elsewhere (or for data going stale).
    useEffect(() => {
        if (auxRequestSettled(readBack, request)) setRequest(null);
    }, [readBack, request]);

    const state = auxRowState(readBack, request, now);
    // While pending the switch shows where it is going; otherwise what the PLC reports.
    const shownOn = state === "pending" ? Boolean(request?.requested) : readBack === true;
    const disabled = !canWrite || Boolean(request?.busy);
    const text = state === "unknown" ? "—" : shownOn ? "ON" : "OFF";

    const toggle = async () => {
        const requested = !shownOn;
        setError(null);
        setRequest({ requested, busy: true, ackedAt: null });
        const response = await call({ data: requested });
        if (response?.success) {
            setRequest({ requested, busy: false, ackedAt: Date.now() });
            return;
        }
        setRequest(null);
        // A null response means the call itself failed (timeout, not advertised, disconnected).
        setError(response ? response.message || "Rejected by the rover" : "No answer from the rover");
    };

    return (
        <div className={`aux-row ${state === "unknown" ? "aux-row-stale" : ""}`}>
            <div className="aux-name">
                <span>{name}</span>
                <span className="aux-pin">{auxPin("output", index)}</span>
                {state === "mismatch" && <span className="aux-err">PLC reports {readBack ? "ON" : "OFF"}</span>}
                {error && <span className="aux-err">{error}</span>}
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={shownOn}
                aria-label={`${name} (${auxPin("output", index)})`}
                className={`aux-switch ${shownOn ? "aux-switch-on" : ""} ${state === "pending" ? "aux-switch-pending" : ""}`}
                disabled={disabled}
                title={canWrite ? `Switch ${shownOn ? "OFF" : "ON"}` : reason}
                onClick={toggle}
            >
                <span className="aux-switch-knob">
                    {state === "pending" && <LoaderCircle size={12} className="aux-spin" />}
                </span>
                <span className="aux-switch-text">{text}</span>
            </button>
        </div>
    );
};

/** Switch the PLC's general-purpose aux outputs and watch its aux inputs. Not safety IO. */
export const AuxIoModal = ({ aux, onClose }: { aux: AuxIoSummary; onClose: () => void }) => {
    const { config } = useApp();
    const indices = Array.from({ length: AUX_COUNT }, (_, i) => i);

    return (
        <Modal onClose={onClose} title="Aux IO" icon={<CircuitBoard size={16} />}>
            <div className={`aux-status aux-status-${aux.level}`}>{aux.detail}</div>

            <div className="aux-grid">
                <section className="aux-section" aria-label="Outputs">
                    <h3 className="aux-heading">Outputs</h3>
                    {indices.map((i) => (
                        <OutputRow
                            key={i}
                            index={i}
                            name={config.auxOutputNames[i]}
                            readBack={aux.outputs ? aux.outputs[i] : null}
                            canWrite={aux.canWrite}
                            reason={aux.reason}
                        />
                    ))}
                </section>

                <section className="aux-section" aria-label="Inputs">
                    <h3 className="aux-heading">Inputs</h3>
                    {indices.map((i) => {
                        const active = aux.inputs ? aux.inputs[i] : null;
                        return (
                            <div key={i} className={`aux-row ${active === null ? "aux-row-stale" : ""}`}>
                                <div className="aux-name">
                                    <span>{config.auxInputNames[i]}</span>
                                    <span className="aux-pin">{auxPin("input", i)}</span>
                                </div>
                                <span className={`aux-dot ${active ? "aux-dot-on" : ""}`}>
                                    {active === null ? "—" : active ? "ON" : "OFF"}
                                </span>
                            </div>
                        );
                    })}
                </section>
            </div>

            <p className="aux-note">
                General-purpose IO on the safety PLC. It is not part of the safety chain: switching it
                never stops or releases the rover.
            </p>
        </Modal>
    );
};
