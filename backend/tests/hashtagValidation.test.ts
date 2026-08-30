import { describe, expect, test } from "bun:test";
import {
  normalizeHashtag,
  isValidHashtag,
  isValidPayoutSplit,
  TOTAL_BPS,
} from "../src/v1/services/hashtagValidation";

describe("normalizeHashtag", () => {
  test("strips leading # and lowercases", () => {
    expect(normalizeHashtag("#PayUs")).toBe("payus");
    expect(normalizeHashtag("finance")).toBe("finance");
    expect(normalizeHashtag("  #Linda  ")).toBe("linda");
  });
});

describe("isValidHashtag", () => {
  test("accepts lowercase alphanumeric and underscore between 3 and 32 chars", () => {
    expect(isValidHashtag("#finance")).toBe(true);
    expect(isValidHashtag("pay_us_2")).toBe(true);
  });

  test("rejects too short, too long, and disallowed characters", () => {
    expect(isValidHashtag("ab")).toBe(false);
    expect(isValidHashtag("a".repeat(33))).toBe(false);
    expect(isValidHashtag("has space")).toBe(false);
    expect(isValidHashtag("has-dash")).toBe(false);
  });
});

describe("isValidPayoutSplit", () => {
  test("accepts splits that sum to exactly TOTAL_BPS", () => {
    expect(
      isValidPayoutSplit([
        { wallet: "0xA", percentageBps: 7000 },
        { wallet: "0xB", percentageBps: 3000 },
      ]),
    ).toBe(true);
    expect(isValidPayoutSplit([{ wallet: "0xA", percentageBps: TOTAL_BPS }])).toBe(true);
  });

  test("rejects empty splits, zero-bps entries, and sums that don't equal TOTAL_BPS", () => {
    expect(isValidPayoutSplit([])).toBe(false);
    expect(isValidPayoutSplit([{ wallet: "0xA", percentageBps: 9999 }])).toBe(false);
    expect(
      isValidPayoutSplit([
        { wallet: "0xA", percentageBps: 0 },
        { wallet: "0xB", percentageBps: TOTAL_BPS },
      ]),
    ).toBe(false);
  });
});
