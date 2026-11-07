// A stand-in for the Anthropic Messages API, so end-to-end tests never call the real one.
import http from "node:http";

const recipe = {
  is_recipe: true,
  name: "Halloumi and white bean tray bake",
  slot: "dinner",
  servings: 2,
  tags: ["halloumi", "beans", "vegetarian"],
  ingredients: [
    { name: "Halloumi", quantity: 180, unit: "g", category: "dairy", kcal: 576, protein_g: 39.6, fibre_g: 0 },
    { name: "Butter beans, 400 g tin (drained)", quantity: 1, unit: "whole", category: "pantry", kcal: 230, protein_g: 15, fibre_g: 12 },
    { name: "Red capsicum", quantity: 2, unit: "whole", category: "produce", kcal: 60, protein_g: 2, fibre_g: 4.2 },
    { name: "Olive oil", quantity: 1, unit: "tbsp", category: "pantry", kcal: 119, protein_g: 0, fibre_g: 0 },
  ],
  per_serve: { kcal: 492.5, protein_g: 28.3, fibre_g: 8.1 },
  method: "1. Roast the capsicum and beans at 200°C for 20 minutes.\n2. Add the halloumi and roast 10 minutes more.",
  assumptions: ["Assumed 2 medium capsicums."],
};

const port = Number(process.env.STUB_PORT ?? 4599);
http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.method !== "POST" || !req.url?.startsWith("/v1/messages")) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: "msg_stub",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-5-5",
          content: [{ type: "text", text: JSON.stringify(recipe) }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 100, output_tokens: 200 },
        }),
      );
    });
  })
  .listen(port, "127.0.0.1", () => console.log(`stub anthropic on ${port}`));
