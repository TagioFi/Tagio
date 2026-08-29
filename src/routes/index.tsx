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
        gap: "1.25rem",
      }}
    >
      <img
        src="/logo.png"
        alt="Tagio Logo"
        style={{
          width: "80px",
          height: "80px",
          borderRadius: "16px",
          objectFit: "contain",
        }}
      />
      <h1 style={{ fontSize: "2.5rem", fontWeight: "bold", margin: 0 }}>
        hello world Tagio
      </h1>
    </div>
  );
}
