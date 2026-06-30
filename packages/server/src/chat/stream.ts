export type Push = (event: string, data: unknown) => void;

export function createPush(reply: { raw: { write: (chunk: string) => void } }): Push {
  return (event: string, data: unknown) => {
    reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
}