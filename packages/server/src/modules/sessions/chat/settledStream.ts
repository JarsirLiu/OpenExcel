/** Keeps a client stream open until the server-owned run settlement finishes. */
export function holdStreamOpenUntil<T>(
  stream: ReadableStream<T>,
  settlement: Promise<unknown>,
): ReadableStream<T> {
  return stream.pipeThrough(
    new TransformStream<T, T>({
      async flush() {
        await settlement;
      },
    }),
  );
}
