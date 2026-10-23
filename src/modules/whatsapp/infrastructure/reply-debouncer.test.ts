import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createReplyDebouncer, type DebouncedRun } from "./reply-debouncer";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("createReplyDebouncer", () => {
  it("agrupa mensajes seguidos en una sola respuesta", async () => {
    const runs: DebouncedRun[] = [];
    const debouncer = createReplyDebouncer(async (input) => void runs.push(input), 30);
    debouncer.schedule("t1", "c1");
    await wait(10);
    debouncer.schedule("t1", "c1");
    await wait(10);
    debouncer.schedule("t1", "c1");
    await wait(60);
    assert.equal(runs.length, 1);
    assert.equal(runs[0]!.lateSince, undefined);
  });

  it("responde después lo que llegó mientras respondía", async () => {
    const runs: DebouncedRun[] = [];
    const debouncer = createReplyDebouncer(async (input) => {
      runs.push(input);
      await wait(40);
    }, 10);
    debouncer.schedule("t1", "c1");
    await wait(20); // ya está respondiendo
    debouncer.schedule("t1", "c1");
    await wait(100);
    assert.equal(runs.length, 2);
    assert.ok(runs[1]!.lateSince instanceof Date);
  });
});
