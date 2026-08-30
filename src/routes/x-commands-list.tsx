import { createFileRoute } from "@tanstack/react-router";
import XCommandsList from "../pages/XCommandsList.jsx";

export const Route = createFileRoute("/x-commands-list")({
  head: () => ({
    meta: [
      { title: "X commands — Tagio" },
      { name: "description", content: "Every command TagioPay's X bot understands." },
    ],
  }),
  component: () => <XCommandsList />,
});
