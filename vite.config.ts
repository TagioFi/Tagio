// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    build: {
      rollupOptions: {
        // @coinbase/cdp-sdk (pulled in transitively by @base-org/account, part
        // of RainbowKit's default wallet connectors) has several *dynamic*
        // imports of @x402/evm subpaths (e.g. "@x402/evm/exact/client") inside
        // its optional x402-payment code path, which TagioPay never calls --
        // @x402/evm is declared optional in cdp-sdk's peerDependenciesMeta.
        // Nitro's Vercel-preset dependency tracing tries to statically resolve
        // these anyway and fails since no @x402/* package is installed
        // (reproduced locally with `VERCEL=1 bun run build`; the default/
        // Cloudflare preset doesn't hit this). Marking the whole scope
        // external leaves these as real runtime import() calls instead of
        // build-time-resolved ones -- correct for something genuinely
        // optional and unused: it would only fail if the x402 payment flow
        // were ever actually invoked, which nothing in this app does.
        external: [/^@x402\//],
      },
    },
  },
});
