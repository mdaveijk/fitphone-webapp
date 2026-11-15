import type { Worker } from "tesseract.js";
import { validateFiles } from "./validation";

export interface RecognitionProgress {
  percent: number;
  message: string;
}
type TesseractLoader = () => Promise<
  Pick<typeof import("tesseract.js"), "createWorker">
>;
const loadTesseract: TesseractLoader = () => import("tesseract.js");

/** Files stay in this browser. Tesseract's default CDN supplies worker/WASM/language assets only. */
export async function runRecognitionEngine(
  files: File[],
  onProgress: (progress: RecognitionProgress) => void,
  signal?: AbortSignal,
  load: TesseractLoader = loadTesseract,
): Promise<string[]> {
  const errors = validateFiles(files);
  if (errors.length) throw new Error(errors.join(" "));
  if (signal?.aborted) throw new DOMException("Geannuleerd", "AbortError");
  let worker: Worker | undefined;
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => {};
  let failWorker: (reason: Error) => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    abort = () => reject(new DOMException("Geannuleerd", "AbortError"));
    failWorker = reject;
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
  });
  const work = async () => {
    onProgress({
      percent: 0,
      message:
        "Herkenning laden… De eerste keer worden taalbestanden gedownload.",
    });
    const { createWorker } = await load();
    if (finished) return [];
    let index = 0;
    const created = await createWorker(["nld", "eng"], 1, {
      logger: (message) => {
        if (finished) return;
        if (message.status === "recognizing text")
          onProgress({
            percent: Math.round(
              ((index + message.progress) / files.length) * 100,
            ),
            message: `Screenshot ${index + 1} van ${files.length} herkennen…`,
          });
      },
      errorHandler: (error) => failWorker(new Error(String(error))),
    });
    if (finished) {
      await created.terminate();
      return [];
    }
    worker = created;
    const texts: string[] = [];
    for (index = 0; index < files.length; index++) {
      if (finished) break;
      const { data } = await worker.recognize(files[index]);
      texts.push(data.text);
    }
    if (!texts.some((text) => text.trim()))
      throw new Error(
        "Geen leesbare tekst gevonden. Kies een scherp dagoverzicht of vul handmatig in.",
      );
    return texts;
  };
  try {
    return await Promise.race([work(), interrupted]);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new Error(
      error instanceof Error
        ? error.message
        : "Herkenning mislukt. Probeer opnieuw of vul handmatig in.",
    );
  } finally {
    finished = true;
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    if (worker) await worker.terminate().catch(() => {});
  }
}
