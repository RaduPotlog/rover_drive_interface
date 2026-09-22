import type { ReactNode } from "react";

import { useServiceCall } from "../hooks/useService";

interface TriggerResponse { success: boolean; message: string }

/**
 * A std_srvs/Trigger button: optional confirm prompt, busy while the call runs, an alert when
 * the service answers success=false and an inline "failed" when the call itself fails.
 * Shared by the Drive tab's Safety panel, the top-bar E-STOP and the map drive widget.
 */
export const TriggerButton = ({ service, label, icon, className, confirmText, disabled = false, title, wrapClassName = "" }: {
    service: string;
    label: string;
    icon: ReactNode;
    className: string;
    confirmText?: string;
    disabled?: boolean;
    title?: string;
    wrapClassName?: string;
}) => {
    const { call, busy, error } = useServiceCall<Record<string, never>, TriggerResponse>(service, 3000);
    return (
        <div className={`trigger ${wrapClassName}`}>
            <button
                className={className}
                disabled={busy || disabled}
                title={title}
                aria-label={label}
                onClick={async () => {
                    if (confirmText && !window.confirm(confirmText)) return;
                    const res = await call({});
                    if (res && !res.success) window.alert(`${label}: ${res.message}`);
                }}
            >
                {icon}<span className="trigger-label">{label}</span>
            </button>
            {error && <span className="error-text" title={error}>failed</span>}
        </div>
    );
};
