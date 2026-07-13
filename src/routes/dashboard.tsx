import { createFileRoute } from "@tanstack/react-router";
import Dashboard from "../pages/Dashboard.jsx";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Tagio" },
      { name: "description", content: "Your Tagio dashboard." },
    ],
  }),
  component: () => <Dashboard />,
});
