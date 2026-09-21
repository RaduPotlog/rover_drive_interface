import { OctagonX, RotateCcw, ShieldCheck, Unlock } from "lucide-react";
import type { ReactNode } from "react";

import { useApp } from "../AppContext";
import { useServiceCall } from "../hooks/useService";
import { nsName } from "../lib/namespace";

interface TriggerResponse { success: boolean; message: string }

const TriggerButton = ({ service, label, icon, className, confirmText }: {
    service: string;
    label: string;
    icon: ReactNode;
    className: string;
    confirmText?: string;
}) => {
    const { call, busy, error } = useServiceCall<Record<string, never>, TriggerResponse>(service, 3000);
    return (
        <div className={`trigger ${className.includes("btn-estop") ? "btn-estop-wrap" : ""}`}>
            <button
                className={className}
                disabled={busy}
                onClick={async () => {
                    if (confirmText && !window.confirm(confirmText)) return;
                    const res = await call({});
                    if (res && !res.success) window.alert(`${label}: ${res.message}`);
                }}
            >
                {icon}{label}
            </button>
            {error && <span className="error-text" title={error}>failed</span>}
        </div>
    );
};

export const EStopPanel = () => {
    const { config } = useApp();
    const hw = (name: string) => nsName(config.namespace, `hardware_interface/${name}`);
    return (
        <section className="card">
            <div className="card-head">
                <h3 className="card-title"><ShieldCheck size={15} />Safety</h3>
            </div>
            <div className="estop-grid">
                <TriggerButton service={hw("sw_user_e_stop_set")} label="E-STOP" icon={<OctagonX size={20} />}
                    className="btn btn-estop" />
                <TriggerButton
                    service={hw("sw_user_e_stop_reset")}
                    label="Reset e-stop"
                    icon={<RotateCcw size={15} />}
                    className="btn"
                    confirmText="Release the software e-stop? Make sure the area around the rover is clear."
                />
                <TriggerButton
                    service={hw("sw_e_stop_latch_reset")}
                    label="Reset latch"
                    icon={<Unlock size={15} />}
                    className="btn"
                    confirmText="Reset the safety latch? The motor contactor will re-engage."
                />
            </div>
            <p className="hint">The software e-stop cuts the motor contactor. The hardware button always wins. After a restart the latch is set - reset it before driving.</p>
        </section>
    );
};
