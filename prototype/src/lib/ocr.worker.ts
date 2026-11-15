import { runRecognitionEngine } from "./ocr-engine";
import type { OcrMessage } from "./ocr";

// Owning Tesseract in a supervisor also allows cancellation during initialization,
// before createWorker resolves and exposes its worker handle.
const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<File[]>) => void;
  postMessage: (message: OcrMessage) => void;
};
scope.onmessage = async (event) => {
  try {
    const texts = await runRecognitionEngine(event.data, (progress) =>
      scope.postMessage({ type: "progress", progress }),
    );
    scope.postMessage({ type: "result", texts });
  } catch (error) {
    scope.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Herkenning mislukt.",
    });
  }
};
