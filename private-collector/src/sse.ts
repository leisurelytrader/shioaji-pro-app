export interface SseMessage { event: string; data: string; id?: string }
export type SseHandler = (message: SseMessage) => Promise<void> | void;

export async function readSse(url: string, signal: AbortSignal, handler: SseHandler) {
    const response = await fetch(url, { headers: { Accept: 'text/event-stream' }, signal });
    if (!response.ok || !response.body) throw new Error(`SSE ${response.status}: ${await response.text()}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder(); let buffer = ''; let event = 'message'; let data: string[] = []; let id: string | undefined;
    const dispatch = async () => { if (data.length) await handler({ event, data: data.join('\n'), id }); event = 'message'; data = []; };
    try {
        while (true) {
            const part = await reader.read(); if (part.done) break;
            buffer += decoder.decode(part.value, { stream: true });
            const lines = buffer.split(/\r?\n/); buffer = lines.pop() ?? '';
            for (const line of lines) {
                if (line === '') { await dispatch(); continue; }
                if (line.startsWith(':')) continue;
                const separator = line.indexOf(':'); const field = separator < 0 ? line : line.slice(0, separator); const value = separator < 0 ? '' : line.slice(separator + 1).replace(/^ /, '');
                if (field === 'event') event = value; else if (field === 'data') data.push(value); else if (field === 'id') id = value;
            }
        }
        await dispatch();
    } finally { reader.releaseLock(); }
}
