import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AGENT_MODELS, acceptsTemperature, findAgentModel, replyCostUsd } from "./agent-models";

describe("modelos del agente", () => {
  it("los GPT-5 no reciben temperatura; Gemini y GPT-4o sí", () => {
    assert.equal(acceptsTemperature("gpt-5-nano"), false);
    assert.equal(acceptsTemperature("o4-mini"), false);
    assert.equal(acceptsTemperature("gpt-4o-mini"), true);
    assert.equal(acceptsTemperature("gemini-2.5-flash-lite"), true);
  });

  it("solo se pueden elegir los modelos de la lista", () => {
    assert.equal(findAgentModel("gemini-2.5-flash-lite")?.provider, "gemini");
    assert.equal(findAgentModel("gemini-ultra-inventado"), undefined);
    assert.equal(new Set(AGENT_MODELS.map((m) => m.id)).size, AGENT_MODELS.length);
  });

  it("calcula el costo de una respuesta con los tokens promedio", () => {
    // 20.000 de entrada a US$0,10 y 600 de salida a US$0,40 por millón
    assert.equal(replyCostUsd({ inPerMillion: 0.1, outPerMillion: 0.4 }, 20_000, 600).toFixed(5), "0.00224");
  });
});

describe("costo con caché", () => {
  it("los tokens en caché se cobran al 25 % del precio de entrada", async () => {
    const { estimateCostMicroUsd } = await import("../infrastructure/pricing");
    // gemini-2.5-flash-lite: US$0,10 entrada. 10.000 tokens sin caché = 1.000 micro-USD
    assert.equal(estimateCostMicroUsd("gemini-2.5-flash-lite", 10_000, 0), 1000);
    // 8.000 de esos en caché: 2.000 a precio completo (200) + 8.000 al 25 % (200)
    assert.equal(estimateCostMicroUsd("gemini-2.5-flash-lite", 10_000, 0, 8_000), 400);
  });
});
