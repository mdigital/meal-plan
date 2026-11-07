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

  it("redirects the fly.dev address to the real domain in production", async () => {
    const t = setup();
    t.deps.config.production = true;
    t.deps.config.appUrl = "https://foodz.dogstar.nz";
    const res = await t.app.request("/meals?slot=dinner", { headers: { host: "mdigital-meals.fly.dev" } });
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://foodz.dogstar.nz/meals?slot=dinner");
    const health = await t.app.request("/healthz", { headers: { host: "mdigital-meals.fly.dev" } });
    expect(health.status).toBe(200);
    const same = await t.app.request("/login", { headers: { host: "foodz.dogstar.nz" } });
    expect(same.status).toBe(200);
  });

  it("sends signed-out visitors to sign in", async () => {
    const res = await setup().app.request("/");
    expect(res.headers.get("location")).toBe("/login");
  });
});
