import { describe, expect, it } from "vitest";
import { setup } from "./helpers.js";

describe("app skeleton", () => {
  it("serves the health check", async () => {
    const res = await setup().app.request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("serves the PWA manifest", async () => {
    const res = await setup().app.request("/manifest.webmanifest");
    expect(res.status).toBe(200);
  });

  it("sends signed-out visitors to sign in", async () => {
    const res = await setup().app.request("/");
    expect(res.headers.get("location")).toBe("/login");
  });
});
