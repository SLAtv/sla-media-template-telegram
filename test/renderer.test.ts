import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { renderPoster } from "../src/renderer.js";
import { DEFAULT_DITHER, type Copy } from "../src/types.js";

const copy: Copy = { handle: "@TEST", role: "HOST", sponsor: "@SLA", name: "TEST PERSON", company: "Empresa", topic: "Tema de prueba", date: "EN VIVO | Miércoles 20 hs", social: "@slatv_" };

test("renderiza una placa PNG cuadrada", async () => {
  const source = await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 120, g: 120, b: 120 } } }).png().toBuffer();
  const output = await renderPoster(source, copy, DEFAULT_DITHER);
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.width, 1600);
  assert.equal(metadata.height, 1600);
  assert.equal(metadata.format, "png");
});
