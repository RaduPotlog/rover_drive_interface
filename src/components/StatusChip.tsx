import type { ReactNode } from "react";

import type { Level } from "../lib/status";

export const StatusChip = ({ level, label, title, icon }: {
    level: Level;
    label: ReactNode;
    title?: string;
    icon?: ReactNode;
}) => (
    <span className={`chip chip-${level}`} title={title}>
        {icon && <span className="chip-icon" aria-hidden>{icon}</span>}
        {label}
    </span>
);
