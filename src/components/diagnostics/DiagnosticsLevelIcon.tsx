import { AlertCircle, AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";

import { levelName, levelToLevel } from "../../lib/diagnostics";

/**
 * The one place a DiagnosticStatus level becomes an icon. Upstream bakes a JSX icon into
 * every tree entry; keeping it here leaves `lib/diagnostics.ts` pure (and node-testable).
 */
export const DiagnosticsLevelIcon = ({ level, size = 15 }: { level: number; size?: number }) => {
    if (level < 0) return null;
    const Icon = level === 3 ? HelpCircle : level === 2 ? AlertCircle : level === 1 ? AlertTriangle : CheckCircle2;
    return (
        <span className={`diag-icon lvl-${levelToLevel(level)}`} title={levelName(level)}>
            <Icon size={size} />
        </span>
    );
};
