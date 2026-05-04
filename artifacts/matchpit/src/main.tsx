import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl } from "@workspace/api-client-react";

// When deployed on Vercel (frontend) + Replit (backend), set the API base URL
// so all /api/* calls go to the correct backend domain.
// In Replit dev mode, VITE_API_BASE_URL is not set and calls stay relative (/api/...).
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
if (apiBaseUrl) {
  setBaseUrl(apiBaseUrl);
}

createRoot(document.getElementById("root")!).render(<App />);
