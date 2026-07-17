import { describe, expect, test } from "bun:test";
import { parseCommand } from "../src/services/x/commandParser";

describe("parseCommand", () => {
  test("parses a native ETH send to a wallet address", () => {
    expect(parseCommand("send 0.5 eth to 0x60a2fC0D95DE145cf1f913194AeD627D61c8b530")).toEqual({
      amount: "0.5",
      token: "native",
      targetType: "wallet",
      targetValue: "0x60a2fC0D95DE145cf1f913194AeD627D61c8b530",
    });
  });

  test("parses a USDG send to a hashtag, case-insensitively", () => {
    expect(parseCommand("SEND 5 USDG TO #tagiopay")).toEqual({
      amount: "5",
      token: "usdg",
      targetType: "hashtag",
      targetValue: "tagiopay",
    });
  });

  test("parses a send to an X account handle", () => {
    expect(parseCommand("send 12 usdg to @friend")).toEqual({
      amount: "12",
      token: "usdg",
      targetType: "x_account",
      targetValue: "friend",
    });
  });

  test("parses within surrounding text (e.g. a mention prefix)", () => {
    expect(parseCommand("@tagiopaybot send 1 eth to @alice please")).toEqual({
      amount: "1",
      token: "native",
      targetType: "x_account",
      targetValue: "alice",
    });
  });

  test("returns null for unparseable text", () => {
    expect(parseCommand("hey bot how are you")).toBeNull();
    expect(parseCommand("send some eth to @alice")).toBeNull();
    expect(parseCommand("send 5 dogecoin to @alice")).toBeNull();
  });
});
