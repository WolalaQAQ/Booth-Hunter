export async function mapWithConcurrency<TInput, TResult>(
  inputs: TInput[],
  concurrency: number,
  worker: (input: TInput, index: number) => Promise<TResult>
): Promise<TResult[]> {
  const limit = Math.max(1, Math.floor(concurrency) || 1);
  const results = new Array<TResult>(inputs.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= inputs.length) {
        return;
      }
      results[currentIndex] = await worker(inputs[currentIndex]!, currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, inputs.length) }, () => runWorker()));
  return results;
}
