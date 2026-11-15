import { describe, expect, it, vi } from "vitest";
import type { Worker } from "tesseract.js";
import { runRecognitionEngine as recognizeScreenshots } from "./ocr-engine";

const image = () => new File(["synthetic"], "test.png", { type: "image/png" });
function mockEngine(text = "Today\nTotal 4h") {
  const recognize = vi.fn().mockResolvedValue({ data: { text } });
  const terminate = vi.fn().mockResolvedValue(undefined);
  const createWorker = vi
    .fn()
    .mockResolvedValue({ recognize, terminate } as unknown as Worker);
  return {
    recognize,
    terminate,
    createWorker,
    load: vi.fn().mockResolvedValue({ createWorker }),
  };
}
describe("browser OCR lifecycle", () => {
  it("loads lazily, supports both languages, reuses one worker and releases it", async () => {
    const engine = mockEngine();
    expect(engine.load).not.toHaveBeenCalled();
    expect(
      await recognizeScreenshots(
        [image(), image()],
        vi.fn(),
        undefined,
        engine.load,
      ),
    ).toHaveLength(2);
    expect(engine.createWorker).toHaveBeenCalledWith(
      ["nld", "eng"],
      1,
      expect.any(Object),
    );
    expect(engine.terminate).toHaveBeenCalledOnce();
  });
  it("rejects invalid files before loading OCR", async () => {
    const engine = mockEngine();
    await expect(
      recognizeScreenshots(
        [new File(["bad"], "bad.svg", { type: "image/svg+xml" })],
        vi.fn(),
        undefined,
        engine.load,
      ),
    ).rejects.toThrow("PNG");
    expect(engine.load).not.toHaveBeenCalled();
  });
  it("handles failed recognition and terminates its worker", async () => {
    const engine = mockEngine();
    engine.recognize.mockRejectedValue(new Error("Image decode failed"));
    await expect(
      recognizeScreenshots([image()], vi.fn(), undefined, engine.load),
    ).rejects.toThrow("Image decode failed");
    expect(engine.terminate).toHaveBeenCalledOnce();
  });
  it("handles empty OCR and initialization failure", async () => {
    const engine = mockEngine("   ");
    await expect(
      recognizeScreenshots([image()], vi.fn(), undefined, engine.load),
    ).rejects.toThrow("Geen leesbare tekst");
    expect(engine.terminate).toHaveBeenCalledOnce();
    engine.createWorker.mockRejectedValue(new Error("Network unavailable"));
    await expect(
      recognizeScreenshots([image()], vi.fn(), undefined, engine.load),
    ).rejects.toThrow("Network unavailable");
  });
  it("handles asynchronous worker errors", async () => {
    const engine = mockEngine();
    engine.recognize.mockImplementation(() => new Promise(() => {}));
    engine.createWorker.mockImplementation(
      async (_languages, _mode, options) => {
        setTimeout(() => options.errorHandler("worker crashed"), 0);
        return { recognize: engine.recognize, terminate: engine.terminate };
      },
    );
    await expect(
      recognizeScreenshots([image()], vi.fn(), undefined, engine.load),
    ).rejects.toThrow("worker crashed");
    expect(engine.terminate).toHaveBeenCalledOnce();
  });
  it("cancels active OCR and releases its worker", async () => {
    const engine = mockEngine();
    const controller = new AbortController();
    engine.recognize.mockImplementation(() => {
      controller.abort();
      return new Promise(() => {});
    });
    await expect(
      recognizeScreenshots([image()], vi.fn(), controller.signal, engine.load),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(engine.terminate).toHaveBeenCalledOnce();
  });
  it("releases a worker even if cancelled during initialization", async () => {
    const engine = mockEngine();
    const controller = new AbortController();
    let resolveWorker: (worker: unknown) => void = () => {};
    engine.createWorker.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveWorker = resolve;
          controller.abort();
        }),
    );
    await expect(
      recognizeScreenshots([image()], vi.fn(), controller.signal, engine.load),
    ).rejects.toMatchObject({ name: "AbortError" });
    resolveWorker({ recognize: engine.recognize, terminate: engine.terminate });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(engine.terminate).toHaveBeenCalledOnce();
    expect(engine.recognize).not.toHaveBeenCalled();
  });
});
