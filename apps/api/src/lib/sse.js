/**
 * Turns an Express response into a Server-Sent Events stream.
 * Each event is written as:  event: <name>\ndata: <json>\n\n
 * @param {import('express').Response} res
 */
export function openEventStream(res) {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  // no-transform: proxies must not compress/buffer the stream.
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  // Disables buffering in nginx-like proxies.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  return {
    /**
     * Sends one event. Returns false if the client is already gone.
     * @param {string} event
     * @param {unknown} data
     */
    send(event, data) {
      if (res.writableEnded || res.destroyed) return false;
      // JSON.stringify escapes newlines, so the payload always fits on one `data:` line.
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      return true;
    },
    end() {
      if (!res.writableEnded) res.end();
    },
  };
}
