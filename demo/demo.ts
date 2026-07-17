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
 * Calls the configured Responses API and prints each event and the final result.
 * @returns A promise that resolves after the response stream has ended.
 */
async function main(): Promise<void> {
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error("请先设置 ARK_API_KEY 环境变量");
  }

  const connector = new Connector(
    "https://ark.cn-beijing.volces.com/api/v3/responses",
    apiKey,
    new ResponsesAPIConverter(),
  );
  const response = connector.call("doubao-seed-evolving", "请用一句话介绍你自己。");

  while (true) {
    const next = await response.next();
    if (next.done) {
      console.log("ResponseResult:");
      console.log(JSON.stringify(next.value, null, 2));
      break;
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
