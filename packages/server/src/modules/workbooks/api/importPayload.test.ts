import { gzipSync } from "node:zlib";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { decompressImportPayload } from "./importPayload.js";

describe("decompressImportPayload", () => {
  it("passes through an uncompressed JSON body and records its size", async () => {
    const app = Fastify();
    app.addHook("preParsing", decompressImportPayload);
    app.post<{ Body: { value: string } }>("/import", { bodyLimit: 1024 }, async (request) => ({
      value: request.body.value,
      metrics: (request as any)._importPayloadMetrics,
    }));

    const body = JSON.stringify({ value: "数据" });
    const response = await app.inject({
      method: "POST",
      url: "/import",
      headers: { "content-type": "application/json" },
      payload: body,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      value: "数据",
      metrics: {
        encodedBytes: Buffer.byteLength(body),
        decodedBytes: Buffer.byteLength(body),
        contentEncoding: "identity",
      },
    });
    await app.close();
  });

  it("decompresses gzip JSON before Fastify parses it", async () => {
    const app = Fastify();
    app.addHook("preParsing", decompressImportPayload);
    app.post<{ Body: { value: string } }>("/import", { bodyLimit: 1024 }, async (request) => ({
      value: request.body.value,
      metrics: (request as any)._importPayloadMetrics,
    }));

    const body = JSON.stringify({ value: "压缩数据" });
    const compressed = gzipSync(body);
    const response = await app.inject({
      method: "POST",
      url: "/import",
      headers: {
        "content-type": "application/json",
        "content-encoding": "gzip",
      },
      payload: compressed,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      value: "压缩数据",
      metrics: {
        encodedBytes: compressed.length,
        decodedBytes: Buffer.byteLength(body),
        contentEncoding: "gzip",
      },
    });
    await app.close();
  });

  it("keeps Fastify body limits applied to decoded gzip content", async () => {
    const app = Fastify();
    app.addHook("preParsing", decompressImportPayload);
    app.post("/import", { bodyLimit: 32 }, async () => ({ ok: true }));

    const response = await app.inject({
      method: "POST",
      url: "/import",
      headers: {
        "content-type": "application/json",
        "content-encoding": "gzip",
      },
      payload: gzipSync(JSON.stringify({ value: "x".repeat(100) })),
    });

    expect(response.statusCode).toBe(413);
    await app.close();
  });
});
