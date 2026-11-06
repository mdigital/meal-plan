import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

describe("app skeleton", () => {
  it("serves the health check", async () => {
    const res = await createApp().request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("renders the home page", async () => {
    const res = await createApp().request("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Meals");
  });
});
