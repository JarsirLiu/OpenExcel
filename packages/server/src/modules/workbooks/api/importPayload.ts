import { Transform } from "node:stream";
import { createGunzip } from "node:zlib";
import type { FastifyReply, FastifyRequest, RequestPayload } from "fastify";

export const IMPORT_PAYLOAD_METRICS_KEY = "_importPayloadMetrics";

export type ImportPayloadMetrics = {
  encodedBytes: number;
  decodedBytes: number;
  contentEncoding: string;
};

type RequestWithImportMetrics = FastifyRequest & {
  [IMPORT_PAYLOAD_METRICS_KEY]?: ImportPayloadMetrics;
};

function setMetrics(request: FastifyRequest, metrics: ImportPayloadMetrics) {
  (request as RequestWithImportMetrics)[IMPORT_PAYLOAD_METRICS_KEY] = metrics;
}

export function decompressImportPayload(
  request: FastifyRequest,
  _reply: FastifyReply,
  payload: RequestPayload,
  done: (error?: Error | null, payload?: RequestPayload) => void,
) {
  const contentEncoding = request.headers["content-encoding"] ?? "identity";
  const encoding = Array.isArray(contentEncoding) ? contentEncoding[0] : contentEncoding;
  const metrics: ImportPayloadMetrics = {
    encodedBytes: 0,
    decodedBytes: 0,
    contentEncoding: encoding,
  };
  setMetrics(request, metrics);

  if (encoding !== "gzip") {
    const passthrough = new Transform({
      transform(chunk, _encoding, callback) {
        const bytes = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
        metrics.encodedBytes += bytes;
        metrics.decodedBytes += bytes;
        callback(null, chunk);
      },
    });
    Object.defineProperty(passthrough, "receivedEncodedLength", {
      get: () => metrics.encodedBytes,
    });
    payload.pipe(passthrough);
    done(null, passthrough);
    return;
  }

  const gunzip = createGunzip();
  gunzip.on("data", (chunk: Buffer | string) => {
    metrics.decodedBytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
  });
  gunzip.on("end", () => {
    metrics.encodedBytes = gunzip.bytesWritten;
  });
  Object.defineProperty(gunzip, "receivedEncodedLength", {
    get: () => gunzip.bytesWritten,
  });
  payload.pipe(gunzip);
  done(null, gunzip);
}
