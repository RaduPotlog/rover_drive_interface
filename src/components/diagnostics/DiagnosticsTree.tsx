import { ChevronDown, ChevronRight, ListTree } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import {
    type DiagnosticsEntry,
    findEntryByRawName,
    findPathToRawName,
    levelName,
} from "../../lib/diagnostics";
import { booleanMeaning } from "../../lib/valueLabels";
import { DiagnosticsLevelIcon } from "./DiagnosticsLevelIcon";

const Detail = ({ entry }: { entry: DiagnosticsEntry }) => {
    const values = Object.entries(entry.values);
    return (
        <div className="diag-detail">
            <h4 className="diag-detail-title">
                <DiagnosticsLevelIcon level={entry.level} size={16} />
                {entry.name}
            </h4>
            <dl className="diag-detail-list">
                <dt>Path</dt><dd className="diag-path-value">{entry.path}</dd>
                <dt>Hardware ID</dt><dd>{entry.hardwareId || "N/A"}</dd>
                <dt>Level</dt><dd className={`lvl-${entry.level < 0 ? "unknown" : levelName(entry.level).toLowerCase()}`}>
                    {entry.level < 0 ? "N/A" : levelName(entry.level)}
                </dd>
                <dt>Message</dt><dd>{entry.message || "N/A"}</dd>
            </dl>
            {values.length > 0 && (
                <>
                    <h5 className="diag-detail-sub">Values</h5>
                    <table className="diag-values">
                        <tbody>
                            {values.map(([key, value]) => {
                                // The safety pins' True/False is ambiguous on its own; the meaning
                                // goes next to the raw value, never instead of it.
                                const meaning = booleanMeaning(key, String(value));
                                return (
                                    <tr key={key}>
                                        <td>{key}</td>
                                        <td>
                                            {String(value)}
                                            {meaning && <strong>{` = ${meaning}`}</strong>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </>
            )}
        </div>
    );
};

/**
 * "All Diagnostics": the whole aggregated tree, expandable, with a detail pane for the
 * selected node. Rows are keyed by `rawName` so expansion survives the 1 Hz refresh.
 */
export const DiagnosticsTree = ({ tree, connected, selectedRawName, onSelect }: {
    tree: DiagnosticsEntry[];
    connected: boolean;
    selectedRawName: string | null;
    onSelect: (rawName: string) => void;
}) => {
    const [expanded, setExpanded] = useState<string[]>([]);

    const toggle = (rawName: string) =>
        setExpanded((prev) => (prev.includes(rawName)
            ? prev.filter((n) => n !== rawName)
            : [...prev, rawName]));

    // Selecting from the Errors/Warnings card must reveal the node, not just highlight a
    // row that is collapsed out of sight.
    useEffect(() => {
        if (!selectedRawName) return;
        const path = findPathToRawName(tree, selectedRawName);
        if (!path || path.length < 2) return;
        const ancestors = path.slice(0, -1);
        setExpanded((prev) => (ancestors.every((a) => prev.includes(a))
            ? prev
            : [...new Set([...prev, ...ancestors])]));
    }, [selectedRawName, tree]);

    const rows = (entries: DiagnosticsEntry[], depth = 0): ReactNode[] =>
        entries.flatMap((entry) => {
            const open = expanded.includes(entry.rawName);
            const hasChildren = entry.children.length > 0;
            return [
                <tr
                    key={entry.rawName}
                    className={`diag-row ${selectedRawName === entry.rawName ? "diag-row-selected" : ""}`}
                    onClick={() => { onSelect(entry.rawName); if (hasChildren) toggle(entry.rawName) }}
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onSelect(entry.rawName);
                            if (hasChildren) toggle(entry.rawName);
                        }
                    }}
                >
                    <td>
                        <span className="diag-tree-name" style={{ paddingLeft: `${depth * 16}px` }}>
                            <span className="diag-caret" aria-hidden="true">
                                {hasChildren && (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                            </span>
                            <DiagnosticsLevelIcon level={entry.level} />
                            <span className="diag-name">{entry.name}</span>
                        </span>
                    </td>
                    <td>{entry.message}</td>
                </tr>,
                ...(open ? rows(entry.children, depth + 1) : []),
            ];
        });

    const selected = selectedRawName ? findEntryByRawName(tree, selectedRawName) : null;

    return (
        <section className="card">
            <div className="card-head">
                <h3 className="card-title"><ListTree size={15} />All Diagnostics</h3>
            </div>
            {tree.length === 0
                ? (
                    <p className="diag-empty">
                        {connected ? "Waiting for diagnostics messages…" : "Attempting to connect to the bridge…"}
                    </p>
                )
                : (
                    <div className={`diag-split ${selected ? "diag-split-open" : ""}`}>
                        <table className="diag-table diag-tree">
                            <thead>
                                <tr><th>Name</th><th>Message</th></tr>
                            </thead>
                            <tbody>{rows(tree)}</tbody>
                        </table>
                        {selected && <Detail entry={selected} />}
                    </div>
                )}
        </section>
    );
};
