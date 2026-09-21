import { useApp } from "../AppContext";
import { useServiceCall } from "../hooks/useService";
import { nsName } from "../lib/namespace";

interface TriggerResponse { success: boolean; message: string }

const TriggerButton = ({ service, label, className, confirmText }: {
    service: string;
    label: string;
    className: string;
    confirmText?: string;
}) => {
    const { call, busy, error } = useServiceCall<Record<string, never>, TriggerResponse>(service, 3000);
    return (
        <div className="trigger">
            <button
                className={className}
                disabled={busy}
                onClick={async () => {
                    if (confirmText && !window.confirm(confirmText)) return;
                    const res = await call({});
                    if (res && !res.success) window.alert(`${label}: ${res.message}`);
                }}
            >
                {label}
            </button>
            {error && <span className="error-text" title={error}>failed</span>}
        </div>
    );
};

export const EStopPanel = () => {
    const { config } = useApp();
    const hw = (name: string) => nsName(config.namespace, `hardware_interface/${name}`);
    return (
        <section className="panel">
            <h3>E-stop</h3>
            <div className="estop-row">
                <TriggerButton service={hw("sw_user_e_stop_set")} label="E-STOP" className="btn btn-estop" />
                <TriggerButton
                    service={hw("sw_user_e_stop_reset")}
                    label="Reset e-stop"
                    className="btn"
                    confirmText="Release the software e-stop? Make sure the area around the rover is clear."
                />
                <TriggerButton
                    service={hw("sw_e_stop_latch_reset")}
                    label="Reset latch"
                    className="btn"
                    confirmText="Reset the safety latch? The motor contactor will re-engage."
                />
            </div>
            <p className="hint">The software e-stop cuts the motor contactor. The hardware button always wins.</p>
        </section>
    );
};
