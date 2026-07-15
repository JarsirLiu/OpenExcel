import { Writable } from "node:stream";

function localTimeISO() {
  const d = new Date();
  const pad = (n: number, len = 2) => n.toString().padStart(len, "0");
  const offset = -d.getTimezoneOffset();
  const offsetHours = Math.floor(Math.abs(offset) / 60);
  const offsetMins = Math.abs(offset) % 60;
  const offsetSign = offset >= 0 ? "+" : "-";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}${offsetSign}${pad(offsetHours)}:${pad(offsetMins)}`;
}

/* ───── 非请求日志 ───── */
function otherFormat(level: string, msg: string) {
  return JSON.stringify({
    time: localTimeISO(),
    level: level.toLowerCase(),
    msg,
  });
}

/* ───── Writable stream（接收 pino 吐出的所有日志） ───── */

export const pinoStream = new Writable({
  write(chunk: Buffer, _enc: BufferEncoding, cb: (err?: Error | null) => void) {
    try {
      const log = JSON.parse(chunk.toString());
      const level = log.level >= 50 ? "ERROR" : log.level >= 40 ? "WARN" : "INFO";

      // 请求日志走 hooks，这里跳过
      if (log.req || log.res) {
        cb();
        return;
      }

      console.log(otherFormat(level, log.msg));
    } catch {
      console.log(chunk.toString().trim());
    }
    cb();
  },
});

/* ───── hooks 里调用的请求日志 ───── */
export function logRequest(req: any, reply: any, startTime: number) {
  const dur = Date.now() - startTime;
  const importPayload = req._importPayloadMetrics;
  console.log(
    JSON.stringify({
      time: localTimeISO(),
      level: "info",
      method: req.method,
      url: req.url,
      status: reply.statusCode,
      duration: dur,
      ...(importPayload
        ? {
            receivedBytes: importPayload.encodedBytes,
            decodedBytes: importPayload.decodedBytes,
            contentEncoding: importPayload.contentEncoding,
          }
        : {}),
    }),
  );
}
