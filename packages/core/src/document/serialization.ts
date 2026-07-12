import { gunzipSync, gzipSync } from "fflate";
import type { DocumentCellValue, DocumentCodec } from "./model.js";

export interface EncodedDocumentPayload {
  codec: DocumentCodec;
  data: Uint8Array<ArrayBuffer>;
}

function copyBytes(value: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy;
}

export function encodeDocumentJson(value: unknown): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const buffer = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(buffer).set(encoded);
  return new Uint8Array(buffer);
}

export function decodeDocumentJson<T>(value: Uint8Array<ArrayBufferLike>): T {
  return JSON.parse(new TextDecoder().decode(value)) as T;
}

export function encodeDocumentPayload(
  value: unknown,
  preferredCodec: DocumentCodec = "json-gzip-v1",
): EncodedDocumentPayload {
  const json = encodeDocumentJson(value);
  if (preferredCodec === "json-v1") return { codec: "json-v1", data: json };
  if (preferredCodec !== "json-gzip-v1") {
    throw new Error(`Unsupported document codec: ${preferredCodec}`);
  }

  const compressed = gzipSync(json);
  return compressed.byteLength < json.byteLength
    ? { codec: "json-gzip-v1", data: copyBytes(compressed) }
    : { codec: "json-v1", data: json };
}

export function decodeDocumentPayload<T>(value: Uint8Array<ArrayBufferLike>, codec: string): T {
  switch (codec) {
    case "json-v1":
      return decodeDocumentJson<T>(value);
    case "json-gzip-v1":
      return decodeDocumentJson<T>(gunzipSync(value));
    default:
      throw new Error(`Unsupported document codec: ${codec}`);
  }
}

export function encodeDocumentChunk(
  cells: Record<string, DocumentCellValue>,
): EncodedDocumentPayload {
  return encodeDocumentPayload({ cells });
}

export function decodeDocumentChunk(
  value: Uint8Array<ArrayBufferLike>,
  codec: string,
): { cells: Record<string, DocumentCellValue> } {
  const payload = decodeDocumentPayload<{ cells?: Record<string, DocumentCellValue> }>(
    value,
    codec,
  );
  return { cells: payload.cells ?? {} };
}
