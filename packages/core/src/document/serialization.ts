export function encodeDocumentJson(value: unknown): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const buffer = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(buffer).set(encoded);
  return new Uint8Array(buffer);
}

export function decodeDocumentJson<T>(value: Uint8Array<ArrayBufferLike>): T {
  return JSON.parse(new TextDecoder().decode(value)) as T;
}
