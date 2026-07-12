import { describe, expect, test } from "bun:test";
import request from "supertest";
import { app } from "../src/app";

describe("GET /health", () => {
  test("returns 200 with ok status and a valid timestamp", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(new Date(res.body.timestamp).toString()).not.toBe("Invalid Date");
  });
});
