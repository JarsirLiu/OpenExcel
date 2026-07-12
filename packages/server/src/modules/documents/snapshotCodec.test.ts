import { encodeDocumentJson } from "@openexcel/core";
import { describe, expect, it } from "vitest";
import { decodeDocumentSnapshot, encodeDocumentSnapshot } from "./snapshotCodec.js";

describe("document snapshot codec", () => {
  it("round-trips chunks and objects without losing renderer-independent bytes", () => {
    const encoded = encodeDocumentSnapshot(
      [
        {
          rowBlock: 1,
          colBlock: 2,
          revision: 7,
          codec: "json-v1",
          data: encodeDocumentJson({ cells: { "0,1": { value: 42 } } }),
        },
      ],
      [
        {
          type: "chart",
          position: encodeDocumentJson({ startRow: 0 }),
          data: encodeDocumentJson({ series: [] }),
        },
      ],
    );

    const decoded = decodeDocumentSnapshot(encoded.chunks, encoded.objects);

    expect(decoded.chunks).toEqual([
      {
        rowBlock: 1,
        colBlock: 2,
        revision: 7,
        codec: "json-v1",
        cells: { "0,1": { value: 42 } },
      },
    ]);
    expect(Array.from(decoded.objects[0]?.position ?? [])).toEqual(
      Array.from(encodeDocumentJson({ startRow: 0 })),
    );
  });
});
