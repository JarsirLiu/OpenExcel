import type { ServerResponse } from "node:http";
import type { AgentEvent, AgentEventSink } from "@openexcel/agent";

/**
 * Bridges the server-owned, durability-confirmed AgentEvent stream to one HTTP
 * subscriber. Publishing never depends on the browser connection staying
 * alive; an HTTP disconnect only detaches this reader.
 */
export function createAgentEventStream() {
  const queue: AgentEvent[] = [];
  let controller: ReadableStreamDefaultController<AgentEvent> | undefined;
  let closed = false;
  let failure: unknown;

  const stream = new ReadableStream<AgentEvent>({
    start(nextController) {
      controller = nextController;
      for (const event of queue.splice(0)) controller.enqueue(event);
      if (closed) nextController.close();
    },
    pull(nextController) {
      if (failure !== undefined) {
        nextController.error(failure);
        return;
      }
      const event = queue.shift();
      if (event) {
        nextController.enqueue(event);
        return;
      }
      if (closed) nextController.close();
    },
    cancel() {
      // The Agent run is deliberately independent from the HTTP subscriber.
      // Stop accepting queued events once this subscriber has detached.
      queue.length = 0;
      closed = true;
    },
  });

  // ReadableStream pull() handles the actual backpressure. The pending list is
  // kept only for the sink API, which may publish before a reader is attached.
  const sink: AgentEventSink = {
    publish(event) {
      if (closed) return;
      if (controller) controller.enqueue(event);
      else queue.push(event);
    },
  };

  return {
    stream,
    sink,
    close() {
      if (closed) return;
      closed = true;
      controller?.close();
    },
    fail(error: unknown) {
      if (closed) return;
      failure = error;
      closed = true;
      controller?.error(error);
    },
  };
}

export async function pipeAgentEventStreamToResponse(
  stream: ReadableStream<AgentEvent>,
  response: ServerResponse,
) {
  const reader = stream.getReader();
  let finished = false;
  const detachReader = () => {
    if (!finished) void reader.cancel();
  };
  response.once("close", detachReader);
  try {
    response.flushHeaders();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const line = `${JSON.stringify(value)}\n`;
      if (!response.write(line)) await onceDrain(response);
    }
  } catch (error) {
    if (!response.destroyed) throw error;
  } finally {
    finished = true;
    response.off("close", detachReader);
    reader.releaseLock();
    if (!response.destroyed) response.end();
  }
}

function onceDrain(response: ServerResponse) {
  return new Promise<void>((resolve) => response.once("drain", resolve));
}
