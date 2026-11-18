/**
 * Reads a Server-Sent Events body, for every streaming call in the browser
 * (Ask's chat stream, Deep Research stages, Coursework drafting and Build).
 * Follows the SSE format: an event ends at a blank line; `event:` names it
 * (the name applies to that event only); `data:` lines are joined with a
 * newline; lines starting with `:` (keep-alive comments) are ignored. A
 * stream that ends without a final blank line still delivers its last event.
 *
 * Each event is handed over with its data parsed as JSON when it is JSON
 * (`json: true`), else as the raw text (for example `[DONE]`). A failed read
 * (the request was aborted, the connection dropped) is thrown to the caller.
 */
export interface SseMessage {
  /** The `event:` name, when the event has one. */
  event?: string;
  /** The parsed JSON, or the raw text when the data is not JSON. */
  data: unknown;
  /** True when `data` was parsed from JSON. */
  json: boolean;
  /** The data exactly as sent. */
  raw: string;
}

export async function readSse(body: ReadableStream<Uint8Array>, onMessage: (m: SseMessage) => void | Promise<void>): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let event: string | undefined;
  let dataLines: string[] = [];

  const dispatch = async () => {
    if (dataLines.length === 0) {
      event = undefined;
      return;
    }
    const raw = dataLines.join("\n");
    const name = event;
    event = undefined;
    dataLines = [];
    let data: unknown = raw;
    let json = false;
    try {
      data = JSON.parse(raw);
      json = true;
    } catch {
      // not JSON: hand over the text
    }
    await onMessage({ ...(name ? { event: name } : {}), data, json, raw });
  };

  const line = async (text: string) => {
    if (text === "") return dispatch();
    if (text.startsWith(":")) return;
    const colon = text.indexOf(":");
    const field = colon < 0 ? text : text.slice(0, colon);
    let value = colon < 0 ? "" : text.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value.trim() || undefined;
    else if (field === "data") dataLines.push(value);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const text = buffer.slice(0, nl).replace(/\r$/, "");
      buffer = buffer.slice(nl + 1);
      await line(text);
    }
  }
  buffer += decoder.decode();
  if (buffer) await line(buffer.replace(/\r$/, ""));
  await dispatch();
}
