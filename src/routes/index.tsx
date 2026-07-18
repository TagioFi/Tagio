import { createFileRoute } from "@tanstack/react-router";
import Home from "../pages/Home.jsx";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tagio — Send money to a name, not an address" },
      { name: "description", content: "Claim your #handle on Robinhood Chain. Payments resolve, split, and settle in about 100ms." },
      { property: "og:title", content: "Tagio — Send money to a name, not an address" },
      { property: "og:description", content: "Claim your #handle on Robinhood Chain. Payments resolve, split, and settle in about 100ms." },
      { property: "og:image", content: "/og.jpg" },
      { name: "twitter:image", content: "/og.jpg" },
    ],
  }),
  component: Index,
});

function Index() {
  return <Home />;
}
