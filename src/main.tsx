import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { loadConfig } from "./config";
import "./styles.css";

loadConfig().then((config) => {
    document.title = `${config.robotName} · Drive`;
    createRoot(document.getElementById("root")!).render(
        <StrictMode>
            <App config={config} />
        </StrictMode>,
    );
});
