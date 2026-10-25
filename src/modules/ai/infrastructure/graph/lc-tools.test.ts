import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeToolArgs, toLangChainTools, toolFields } from "./lc-tools";

const tools = toLangChainTools([
  {
    name: "qualify_lead",
    description: "Guarda la calificación",
    parameters: {
      type: "object",
      properties: {
        zona: { type: "string" },
        busca: { type: "string" },
        temperature: { type: "string", enum: ["HOT", "WARM", "COLD"] },
      },
      required: ["temperature"],
      additionalProperties: false,
    },
    execute: async (args) => JSON.stringify(args),
  },
]);
const qualify = tools.get("qualify_lead")!;

describe("normalizeToolArgs", () => {
  it("lee los campos del esquema", () => {
    assert.deepEqual(toolFields(qualify), ["zona", "busca", "temperature"]);
  });

  it("traduce zone a zona y la herramienta acepta los datos", async () => {
    const args = normalizeToolArgs(qualify, { zone: "Colombia", temperature: "WARM", busca: "carro sandero" });
    assert.deepEqual(args, { zona: "Colombia", temperature: "WARM", busca: "carro sandero" });
    assert.equal(await qualify.invoke(args), JSON.stringify(args));
  });

  it("no pisa el campo correcto si el modelo mandó los dos", () => {
    const args = normalizeToolArgs(qualify, { zone: "x", zona: "Manizales", temperature: "WARM" });
    assert.equal(args.zona, "Manizales");
    assert.equal(args.zone, "x");
  });

  it("un campo desconocido sin equivalente sigue fallando en la validación", async () => {
    await assert.rejects(() => qualify.invoke(normalizeToolArgs(qualify, { color: "rojo", temperature: "WARM" })));
  });
});
