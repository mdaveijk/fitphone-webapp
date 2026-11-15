import { validateFiles } from "./validation";
import { validateImageContents } from "./image-validation";
import type { RecognitionProgress } from "./ocr-engine";
export type { RecognitionProgress } from "./ocr-engine";
export type OcrMessage =
  | { type: "progress"; progress: RecognitionProgress }
  | { type: "result"; texts: string[] }
  | { type: "error"; message: string };

export interface OcrWorker {
  onmessage: ((event: MessageEvent<OcrMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage: (files: File[]) => void;
  terminate: () => void;
}
const createWorker = (): OcrWorker =>
  new Worker(new URL("./ocr.worker.ts", import.meta.url), { type: "module" });

/** Termination also releases its owned Tesseract worker, including during initialization. */
export async function recognizeScreenshots(
  files: File[],
  onProgress: (progress: RecognitionProgress) => void,
  signal?: AbortSignal,
  factory = createWorker,
  decode = validateImageContents,
): Promise<string[]> {
  const errors = validateFiles(files);
  if (errors.length) throw new Error(errors.join(" "));
  if (signal?.aborted) throw new DOMException("Geannuleerd", "AbortError");
  onProgress({ percent: 0, message: "Afbeeldingen controleren…" });
  await decode(files, signal);
  if (signal?.aborted) throw new DOMException("Geannuleerd", "AbortError");
  const worker = factory();
  let abort: () => void = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<string[]>((resolve, reject) => {
      abort = () => reject(new DOMException("Geannuleerd", "AbortError"));
      signal?.addEventListener("abort", abort, { once: true });
      timer = setTimeout(
        () =>
          reject(
            new Error(
              "Herkenning duurt te lang. Probeer een kleiner screenshot of vul handmatig in.",
            ),
          ),
        180_000,
      );
      worker.onmessage = ({ data }) => {
        if (data.type === "progress") onProgress(data.progress);
        if (data.type === "result") resolve(data.texts);
        if (data.type === "error") reject(new Error(data.message));
      };
      worker.onerror = (event) => {
        event.preventDefault();
        reject(
          new Error(
            "De herkenningssoftware kon niet starten. Controleer je internetverbinding.",
          ),
        );
      };
      worker.postMessage(files);
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
  }
}
