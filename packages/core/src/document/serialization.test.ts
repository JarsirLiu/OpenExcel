import { describe, expect, it } from "vitest";
import {
  decodeDocumentChunk,
  decodeDocumentPayload,
  encodeDocumentChunk,
  encodeDocumentJson,
} from "./serialization.js";

describe("document payload serialization", () => {
  it("reads legacy json chunks", () => {
    const encoded = encodeDocumentJson({ cells: { "0,0": { value: "legacy" } } });

    expect(decodeDocumentChunk(encoded, "json-v1")).toEqual({
      cells: { "0,0": { value: "legacy" } },
    });
  });

  it("round-trips chunks through the selected codec", () => {
    const encoded = encodeDocumentChunk({
      "0,0": { value: "repeated-value repeated-value repeated-value" },
      "0,1": { value: "repeated-value repeated-value repeated-value" },
    });

    expect(encoded.codec).toBe("json-gzip-v1");
    expect(decodeDocumentChunk(encoded.data, encoded.codec)).toEqual({
      cells: {
        "0,0": { value: "repeated-value repeated-value repeated-value" },
        "0,1": { value: "repeated-value repeated-value repeated-value" },
      },
    });
  });

  it("rejects unknown codecs instead of silently corrupting data", () => {
    expect(() => decodeDocumentPayload(encodeDocumentJson({}), "future-v2")).toThrow(
      "Unsupported document codec: future-v2",
    );
  });
});
