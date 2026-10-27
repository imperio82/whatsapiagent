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
