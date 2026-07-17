import { ChatCompletionsConverter, Connector } from "neuralink";

/** Minimal Node.js runtime values required by this demo. */
interface DemoRuntime { process?: { env: Record<string, string | undefined>; exitCode?: number } }
const runtime = globalThis as typeof globalThis & DemoRuntime;

/**
 * Runs the Chat Completions demo and prints normalized events and the final result.
 * @returns A promise resolved after the stream finishes.
 */
async function main(): Promise<void> {
  const apiKey = runtime.process?.env.ARK_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) throw new Error("请先设置 ARK_API_KEY 环境变量");
  const connector = new Connector(
    "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
    apiKey,
    new ChatCompletionsConverter(),
  );
  const iterator = connector.call("doubao-seed-evolving", "请用一句话介绍你自己。");
  while (true) {
    const next = await iterator.next();
    if (next.done) {
      console.log("ResponseResult:");
      console.log(JSON.stringify(next.value, null, 2));
      return;
    }
    console.log("ResponseEvent:");
    console.log(JSON.stringify(next.value, null, 2));
  }
}

try {
  await main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  if (runtime.process !== undefined) runtime.process.exitCode = 1;
}
