import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion, domAnimation } from "framer-motion";
import "@xyflow/react/dist/style.css";
import "@roller-rumble/shared-ui/styles.css";
import { AppRouter } from "./router";
import { queryClient } from "./lib/query";
import "./app.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing #root element");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <LazyMotion features={domAnimation}>
        <AppRouter />
      </LazyMotion>
    </QueryClientProvider>
  </React.StrictMode>
);
