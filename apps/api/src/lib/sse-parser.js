// Server-Sent Events parser for fetch() response bodies.
// Works in Node.js and in the browser (only uses ReadableStream and TextDecoder).
// KEEP IN SYNC: apps/web/public/js/sse-parser.js must be an identical copy
// (a test in apps/api/test/sse-parser.test.js enforces this).

/**
 * @typedef {{ event: string, data: string, id?: string }} SSEEvent
 */

/**
 * Parses a byte stream in the text/event-stream format into events.
 * Handles events split across network chunks, multi-byte UTF-8 characters,
 * LF / CRLF / CR line endings, comments and multi-line `data:` fields.
 * @param {ReadableStream<Uint8Array>} stream
 * @returns {AsyncGenerator<SSEEvent>}
 */
export async function* parseSSE(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  /** @type {string[]} */
  let dataLines = [];
  let eventName = '';
  /** @type {string|undefined} */
  let lastId;

  /**
   * Applies one line; returns an event when a blank line completes one.
   * @param {string} line
   * @returns {SSEEvent|null}
   */
  function processLine(line) {
    if (line === '') {
      if (dataLines.length === 0) {
        eventName = '';
        return null;
      }
      /** @type {SSEEvent} */
      const event = { event: eventName || 'message', data: dataLines.join('\n') };
      if (lastId !== undefined) event.id = lastId;
      dataLines = [];
      eventName = '';
      return event;
    }
    if (line.startsWith(':')) return null; // comment / keep-alive
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') dataLines.push(value);
    else if (field === 'event') eventName = value;
    else if (field === 'id') lastId = value;
    return null;
  }

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // A trailing "\r" may be the first half of "\r\n": keep it for the next chunk.
      let carry = '';
      if (buffer.endsWith('\r')) {
        carry = '\r';
        buffer = buffer.slice(0, -1);
      }
      const lines = buffer.split(/\r\n|\r|\n/);
      buffer = (lines.pop() ?? '') + carry;
      for (const line of lines) {
        const event = processLine(line);
        if (event) yield event;
      }
    }

    // End of stream: flush what is left, being lenient with a missing final blank line.
    buffer += decoder.decode();
    const rest = buffer.split(/\r\n|\r|\n/);
    for (const line of [...rest, '']) {
      const event = processLine(line);
      if (event) yield event;
    }
  } finally {
    reader.releaseLock();
  }
}
