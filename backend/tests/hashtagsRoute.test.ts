import { describe, expect, test } from "bun:test";
import request from "supertest";
import { app } from "../src/app";

describe("GET /hashtags", () => {
  test("400s without a valid owner query param (no DB touch)", async () => {
    const missing = await request(app).get("/hashtags");
    expect(missing.status).toBe(400);

    const malformed = await request(app).get("/hashtags").query({ owner: "not-an-address" });
    expect(malformed.status).toBe(400);
  });
});
