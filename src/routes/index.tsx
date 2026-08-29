import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#04170d",
        color: "#c8e860",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "2.5rem", fontWeight: "bold", margin: 0 }}>
        hello world Tagio
      </h1>
      <p style={{ color: "#a1a1aa", marginTop: "0.5rem" }}>
        Executed on Solana · Settled on Robinhood
      </p>
    </div>
  );
}
