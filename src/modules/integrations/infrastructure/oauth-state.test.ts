import { test } from "node:test";
import assert from "node:assert/strict";

import { createState, verifyState } from "./oauth-state";

// La firma lee el secreto al usarse, así que basta con definirlo antes de las pruebas
process.env.AUTH_SECRET ??= "secreto-de-prueba";

test("el state firmado se valida y devuelve el negocio y el usuario", () => {
  const { state, nonce } = createState("t1", "u1", "user", 1_000);
  const data = verifyState(state, 2_000);
  assert.equal(data?.tenantId, "t1");
  assert.equal(data?.userId, "u1");
  assert.equal(data?.nonce, nonce);
  assert.equal(data?.scope, "user");
});

test("el state alterado o vencido se rechaza", () => {
  const { state } = createState("t1", "u1", "user", 1_000);
  const [payload, signature] = state.split(".");
  const forged = Buffer.from(JSON.stringify({ tenantId: "otro", userId: "u1", scope: "business", nonce: "n", exp: 9e15 })).toString("base64url");
  assert.equal(verifyState(`${forged}.${signature}`, 2_000), null);
  assert.equal(verifyState(`${payload}.x${signature}`, 2_000), null);
  assert.equal(verifyState(state, 1_000 + 11 * 60 * 1000), null);
  assert.equal(verifyState("basura", 2_000), null);
});
