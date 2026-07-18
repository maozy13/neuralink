import { AnthropicConverter, Connector } from "neuralink";

/** Minimal Node.js runtime values required by this demo. */
interface DemoRuntime {
  process?: {
    env: Record<string, string | undefined>;
    exitCode?: number;
  };
}

const runtime = globalThis as typeof globalThis & DemoRuntime;

/**
 * Runs the Anthropic demo and prints normalized events and the final response.
 * @returns A promise resolved after the stream finishes.
 */
async function main(): Promise<void> {
  const apiKey = runtime.process?.env.ANTHROPIC_API_KEY;
  const baseUrl = runtime.process?.env.ANTHROPIC_BASE_URL
    ?? "https://api.deepseek.com/anthropic/v1/messages";
  const model = runtime.process?.env.ANTHROPIC_MODEL ?? "deepseek-v4-flash";
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error("请先设置 ANTHROPIC_API_KEY 环境变量");
  }
  const connector = new Connector(
    baseUrl,
    apiKey,
    new AnthropicConverter(),
  );
  const iterator = connector.call(
    model,
    "请用一句话介绍你自己。",
  );
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
