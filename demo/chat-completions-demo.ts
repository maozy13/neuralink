import { ChatCompletionsConverter, Connector } from "neuralink";

/** Minimal Node.js runtime values required by this demo. */
interface DemoRuntime { process?: { env: Record<string, string | undefined>; exitCode?: number } }
const runtime = globalThis as typeof globalThis & DemoRuntime;

/**
 * Returns a deterministic Chat Completions stream for offline verification.
 * @param _input Requested URL or request object, unused by the local stream.
 * @param _init Request options, unused by the local stream.
 * @returns A successful streaming HTTP response.
 */
async function mockFetch(_input: URL | RequestInfo, _init?: RequestInit): Promise<Response> {
  const chunks = [
    { id: "demo_chat", created: 1, choices: [{ index: 0, delta: { role: "assistant", reasoning_content: "生成简短介绍。" } }] },
    { id: "demo_chat", created: 1, choices: [{ index: 0, delta: { content: "我是 NeuralLink，一个统一的大模型客户端。" } }] },
  ];
  const encoder = new TextEncoder();
  const body = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(new ReadableStream({
    start(controller): void {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  }));
}

/**
 * Runs the Chat Completions demo and prints normalized events and the final result.
 * @returns A promise resolved after the stream finishes.
 */
async function main(): Promise<void> {
  const apiKey = runtime.process?.env.ARK_API_KEY;
  const offline = apiKey === undefined || apiKey.length === 0;
  if (offline) console.log("未设置 ARK_API_KEY，使用本地 Chat Completions SSE 流验证 DEMO。\n");
  const connector = new Connector(
    "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
    apiKey ?? "demo-key",
    new ChatCompletionsConverter(),
    offline ? { fetch: mockFetch } : {},
  );
  const iterator = connector.call("doubao-seed-evolving", "请用一句话介绍你自己。");
  let eventCount = 0;
  while (true) {
    const next = await iterator.next();
    if (next.done) {
      console.log(`\n完成，共收到 ${eventCount} 个规范化事件。`);
      console.log("Response:");
      console.log(JSON.stringify(next.value, null, 2));
      return;
    }
    eventCount += 1;
    if ("delta" in next.value) {
      console.log(`${next.value.type}: ${JSON.stringify(next.value.delta)}`);
    } else {
      console.log(`${next.value.type}: ${JSON.stringify(next.value.response)}`);
    }
  }
}

try {
  await main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  if (runtime.process !== undefined) runtime.process.exitCode = 1;
}
