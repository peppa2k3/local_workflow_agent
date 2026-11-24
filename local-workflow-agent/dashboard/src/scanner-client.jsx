import { hydrateRoot } from "react-dom/client";
import ScannerEditor from "./ScannerEditor.jsx";
import "./controllers/scanner.js";

hydrateRoot(document.getElementById("scanner-settings"), <ScannerEditor />);
