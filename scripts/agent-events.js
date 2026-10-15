export function rootCompleted(event) {
  return event.type === "agent.session.turn.completed" && event.turn?.subagent_id == null;
}

export function failed(event) {
  return ["error", "agent.session.failed", "agent.session.environment.failed"].includes(event.type) ||
    ["agent.session.turn.failed", "agent.session.turn.cancelled"].includes(event.type) && event.turn?.subagent_id == null;
}

// SSE can split UTF-8 characters, CRLFs, and JSON records across network chunks.
export async function consumeEvents(body, handle) {
  let buffer = "";
  const decoder = new TextDecoder();
  for await (const chunk of body) {
    buffer = (buffer + decoder.decode(chunk, { stream: true })).replace(/\r\n/g, "\n");
    if (buffer.length > 2 * 1024 * 1024) throw new Error("Event record too large.");
    let split;
    while ((split = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, split); buffer = buffer.slice(split + 2);
      const data = block.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
      if (data && data !== "[DONE]" && await handle(JSON.parse(data))) return true;
    }
  }
  return false;
}
