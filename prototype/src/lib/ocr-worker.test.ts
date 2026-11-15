import { describe, expect, it, vi } from "vitest";
import { recognizeScreenshots, type OcrWorker } from "./ocr";

const image = () => new File(["synthetic"], "test.png", { type: "image/png" });
function setup() {
  const worker: OcrWorker = {
    onmessage: null,
    onerror: null,
    postMessage: vi.fn(),
    terminate: vi.fn(),
  };
  const factory = vi.fn(() => worker);
  return { worker, factory };
}
describe("OCR supervisor lifecycle", () => {
  it("passes progress and results, then terminates the supervisor", async () => {
    const { worker, factory } = setup();
    const progress = vi.fn();
    const result = recognizeScreenshots(
      [image()],
      progress,
      undefined,
      factory,
      async () => {},
    );
    await Promise.resolve();
    worker.onmessage!({
      data: { type: "progress", progress: { percent: 50, message: "working" } },
    } as MessageEvent);
    worker.onmessage!({
      data: { type: "result", texts: ["Today 4h"] },
    } as MessageEvent);
    expect(await result).toEqual(["Today 4h"]);
    expect(progress).toHaveBeenCalledWith({ percent: 50, message: "working" });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it("terminates on cancellation during initialization", async () => {
    const { worker, factory } = setup();
    const controller = new AbortController();
    const result = recognizeScreenshots(
      [image()],
      vi.fn(),
      controller.signal,
      factory,
      async () => {},
    );
    await Promise.resolve();
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it("terminates on a failed recognition message", async () => {
    const { worker, factory } = setup();
    const result = recognizeScreenshots(
      [image()],
      vi.fn(),
      undefined,
      factory,
      async () => {},
    );
    await Promise.resolve();
    worker.onmessage!({
      data: { type: "error", message: "Invalid image" },
    } as MessageEvent);
    await expect(result).rejects.toThrow("Invalid image");
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it("handles worker script failure and releases resources", async () => {
    const { worker, factory } = setup();
    const result = recognizeScreenshots(
      [image()],
      vi.fn(),
      undefined,
      factory,
      async () => {},
    );
    await Promise.resolve();
    worker.onerror!({ preventDefault: vi.fn() } as unknown as ErrorEvent);
    await expect(result).rejects.toThrow("internetverbinding");
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it("times out an unresponsive worker", async () => {
    vi.useFakeTimers();
    try {
      const { worker, factory } = setup();
      const result = recognizeScreenshots(
        [image()],
        vi.fn(),
        undefined,
        factory,
        async () => {},
      );
      const assertion = expect(result).rejects.toThrow("duurt te lang");
      await vi.advanceTimersByTimeAsync(180_000);
      await assertion;
      expect(worker.terminate).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
