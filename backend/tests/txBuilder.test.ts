import { describe, expect, test } from "bun:test";
import { buildUnsignedTransfer } from "../src/services/x/txBuilder";

const WALLET = "0x60a2fC0D95DE145cf1f913194AeD627D61c8b530" as const;

describe("buildUnsignedTransfer", () => {
  test("native ETH: plain value transfer, no calldata", () => {
    const tx = buildUnsignedTransfer("native", WALLET, "0.5");
    expect(tx.to).toBe(WALLET);
    expect(tx.data).toBe("0x");
    expect(tx.value).toBe("500000000000000000"); // 0.5 * 1e18
    expect(tx.amountBaseUnits).toBe("500000000000000000");
  });

  test("USDG: ERC-20 transfer calldata at 6 decimals, zero native value", () => {
    const tx = buildUnsignedTransfer("usdg", WALLET, "5");
    expect(tx.value).toBe("0");
    expect(tx.amountBaseUnits).toBe("5000000"); // 5 * 1e6, not 1e18
    expect(tx.data.startsWith("0xa9059cbb")).toBe(true); // ERC-20 transfer(address,uint256) selector
    expect(tx.to.toLowerCase()).not.toBe(WALLET.toLowerCase()); // goes to the token contract, not the recipient
  });
});
