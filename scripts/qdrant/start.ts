import { ensureQdrantAvailable } from "../../src/lib/search/indexes/qdrant/ensure";
import { getQdrantConfig } from "../../src/lib/search/indexes/qdrant/client";

async function main() {
  const config = getQdrantConfig();
  const result = await ensureQdrantAvailable(config);

  console.log(
    JSON.stringify(
      {
        url: result.url,
        started: result.started,
        binaryPath: result.binaryPath,
        runtimeDir: result.runtimeDir,
        collections: config.collections,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
