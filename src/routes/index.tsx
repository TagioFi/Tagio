import { createFileRoute, redirect } from "@tanstack/react-router";

// The app is an imported static site served from /public/site.
// Redirect / to the site's entry page with a full document navigation.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ href: "/site/index.html" });
  },
  component: () => null,
});
