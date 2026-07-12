import { type DocumentChunk, decodeDocumentJson, encodeDocumentJson } from "@openexcel/core";

interface EncodedChunk {
  rowBlock: number;
  colBlock: number;
  revision: number;
  codec: string;
  data: number[];
}

interface EncodedObject {
  type: string;
  position: number[];
  data: number[];
}

export interface DecodedDocumentSnapshot {
  chunks: DocumentChunk[];
  objects: Array<{
    type: string;
    position: Uint8Array<ArrayBufferLike>;
    data: Uint8Array<ArrayBufferLike>;
  }>;
}

function bytesToNumbers(data: Uint8Array<ArrayBufferLike>): number[] {
  return Array.from(data);
}

export function encodeDocumentSnapshot(
  chunks: Iterable<{
    rowBlock: number;
    colBlock: number;
    revision: number;
    codec: string;
    data: Uint8Array<ArrayBufferLike>;
  }>,
  objects: Iterable<{
    type: string;
    position: Uint8Array<ArrayBufferLike>;
    data: Uint8Array<ArrayBufferLike>;
  }>,
): { chunks: Uint8Array<ArrayBuffer>; objects: Uint8Array<ArrayBuffer> } {
  const encodedChunks: EncodedChunk[] = [...chunks].map((chunk) => ({
    rowBlock: chunk.rowBlock,
    colBlock: chunk.colBlock,
    revision: chunk.revision,
    codec: chunk.codec,
    data: bytesToNumbers(chunk.data),
  }));
  const encodedObjects: EncodedObject[] = [...objects].map((object) => ({
    type: object.type,
    position: bytesToNumbers(object.position),
    data: bytesToNumbers(object.data),
  }));

  return {
    chunks: encodeDocumentJson({ chunks: encodedChunks }),
    objects: encodeDocumentJson({ objects: encodedObjects }),
  };
}

export function decodeDocumentSnapshot(
  chunks: Uint8Array<ArrayBufferLike>,
  objects: Uint8Array<ArrayBufferLike>,
): DecodedDocumentSnapshot {
  const encodedChunks = decodeDocumentJson<{ chunks?: EncodedChunk[] }>(chunks).chunks ?? [];
  const encodedObjects = decodeDocumentJson<{ objects?: EncodedObject[] }>(objects).objects ?? [];

  return {
    chunks: encodedChunks.map((chunk) => ({
      rowBlock: chunk.rowBlock,
      colBlock: chunk.colBlock,
      revision: chunk.revision,
      codec: chunk.codec as DocumentChunk["codec"],
      cells: decodeDocumentJson<{ cells: DocumentChunk["cells"] }>(new Uint8Array(chunk.data))
        .cells,
    })),
    objects: encodedObjects.map((object) => ({
      type: object.type,
      position: new Uint8Array(object.position),
      data: new Uint8Array(object.data),
    })),
  };
}
