import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { AuthProvider } from "./auth/AuthContext";
import "./index.css";
import { ReadAloudProvider } from "./readAloud/ReadAloudContext";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ReadAloudProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ReadAloudProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
