import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { robinhoodChain } from "./chain";

// WalletConnect Cloud project id (https://cloud.reown.com). Injected browser
// wallets work without a real one; mobile/QR wallets need it.
const projectId =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "tagio-dev-placeholder";

export const wagmiConfig = getDefaultConfig({
  appName: "Tagio",
  projectId,
  chains: [robinhoodChain],
  transports: {
    [robinhoodChain.id]: http(),
  },
  ssr: true,
});
