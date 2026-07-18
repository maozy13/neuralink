import { Connector, ResponsesAPIConverter } from "neuralink";

/** Node.js runtime values used by the demo without requiring Node type declarations. */
interface DemoRuntime {
  process?: {
    env: Record<string, string | undefined>;
    exitCode?: number;
  };
}

const runtime = globalThis as typeof globalThis & DemoRuntime;
const apiKey = runtime.process?.env.ARK_API_KEY;

/**
 * Returns a deterministic Responses API stream for offline demo verification.
 * @param _input Requested URL or request object, unused by the local stream.
 * @param _init Request options, unused by the local stream.
 * @returns A successful streaming HTTP response.
 */
async function mockFetch(_input: URL | RequestInfo, _init?: RequestInit): Promise<Response> {
  const events = [
    { type: "response.created", response: { id: "demo_response", created_at: 1, status: "in_progress" } },
    { type: "response.output_item.added", item: { type: "reasoning" } },
    { type: "response.reasoning_summary_text.delta", delta: "生成一句简短的自我介绍。" },
    { type: "response.output_item.added", item: { type: "message" } },
    { type: "response.output_text.delta", delta: "我是 NeuralLink，一个连接不同大模型服务的统一客户端。" },
    { type: "response.completed", response: { id: "demo_response", created_at: 1, status: "completed", output: [] } },
  ];
  const encoder = new TextEncoder();
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(new ReadableStream({
    start(controller): void {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  }));
}

/**
 * Calls the configured Responses API and prints each event and the final result.
 * @returns A promise that resolves after the response stream has ended.
 */
async function main(): Promise<void> {
  const offline = apiKey === undefined || apiKey.length === 0;
  if (offline) console.log("未设置 ARK_API_KEY，使用本地 SSE 流验证 DEMO。\n");

  const connector = new Connector(
    "https://ark.cn-beijing.volces.com/api/v3/responses",
    apiKey ?? "demo-key",
    new ResponsesAPIConverter(),
    offline ? { fetch: mockFetch } : {},
  );
  const response = connector.call("doubao-seed-evolving", "请用一句话介绍你自己。");
  let eventCount = 0;

  while (true) {
    const next = await response.next();
    if (next.done) {
      console.log(`\n完成，共收到 ${eventCount} 个规范化事件。`);
      console.log("Response:");
      console.log(JSON.stringify(next.value, null, 2));
      break;
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
