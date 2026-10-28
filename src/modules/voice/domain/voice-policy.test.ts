import { test } from "node:test";
import assert from "node:assert/strict";
import { decideVoiceReply, estimateSeconds, hasReadableData, speakableText, type VoicePolicy } from "./voice-policy";

const policy: VoicePolicy = {
  enabled: true,
  mode: "MIRROR",
  rules: [],
  intents: [],
  maxSeconds: 40,
  textForData: true,
  alsoSendText: false,
};
const turn = { reply: "¡Hola! Claro que sí, con gusto te ayudo.", intent: "ventas", clientSentAudio: true, routerSuggestsVoice: false };

test("apagada: siempre texto", () => {
  assert.equal(decideVoiceReply({ ...policy, enabled: false }, turn).voice, false);
});

test("modo MIRROR: voz solo si el cliente mandó audio", () => {
  assert.equal(decideVoiceReply(policy, turn).voice, true);
  assert.equal(decideVoiceReply(policy, { ...turn, clientSentAudio: false }).voice, false);
});

test("modo RULES: decide el router", () => {
  const rules = { ...policy, mode: "RULES" as const };
  assert.equal(decideVoiceReply(rules, { ...turn, clientSentAudio: false, routerSuggestsVoice: true }).voice, true);
  assert.equal(decideVoiceReply(rules, { ...turn, routerSuggestsVoice: false }).voice, false);
});

test("modo ALWAYS: voz aunque el cliente escriba", () => {
  assert.equal(decideVoiceReply({ ...policy, mode: "ALWAYS" }, { ...turn, clientSentAudio: false }).voice, true);
});

test("respuestas largas van por texto", () => {
  const long = "Te cuento cómo funciona. ".repeat(40);
  const d = decideVoiceReply(policy, { ...turn, reply: long });
  assert.equal(d.voice, false);
  assert.match(d.reason, /muy larga/);
});

test("especialistas sin voz", () => {
  assert.equal(decideVoiceReply({ ...policy, intents: ["info"] }, turn).voice, false);
  assert.equal(decideVoiceReply({ ...policy, intents: ["ventas"] }, turn).voice, true);
});

test("precios, enlaces y códigos también van por texto", () => {
  const d = decideVoiceReply(policy, { ...turn, reply: "El kilo está a $160.000, tu pedido es PED-0142." });
  assert.equal(d.voice, true);
  assert.equal(d.alsoText, true);
  assert.equal(decideVoiceReply({ ...policy, textForData: false }, { ...turn, reply: "Cuesta $160.000" }).alsoText, false);
});

test("detección de datos", () => {
  assert.equal(hasReadableData("Cuesta $45.000"), true);
  assert.equal(hasReadableData("Mira www.tienda.co"), true);
  assert.equal(hasReadableData("Escríbenos a ventas@tienda.co"), true);
  assert.equal(hasReadableData("El bien INV-0012 está disponible"), true);
  assert.equal(hasReadableData("Claro que sí, mañana te confirmo"), false);
});

test("texto para leer en voz alta sin emojis ni formato", () => {
  assert.equal(speakableText("¡Listo! ✅ *Quedó* tu pedido ☕"), "¡Listo! Quedó tu pedido.");
  assert.equal(estimateSeconds(`${"a".repeat(149)}.`), 10);
});
