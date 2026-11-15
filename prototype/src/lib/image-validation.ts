const MAX_PIXELS = 16_000_000;

/** Check actual decoding before downloading OCR assets; metadata alone cannot prove a file is an image. */
export async function validateImageContents(
  files: File[],
  signal?: AbortSignal,
): Promise<void> {
  for (const file of files) {
    if (signal?.aborted) throw new DOMException("Geannuleerd", "AbortError");
    const url = URL.createObjectURL(file);
    const image = new Image();
    let abort: () => void = () => {};
    try {
      await new Promise<void>((resolve, reject) => {
        abort = () => reject(new DOMException("Geannuleerd", "AbortError"));
        signal?.addEventListener("abort", abort, { once: true });
        image.onload = () => {
          if (image.naturalWidth * image.naturalHeight > MAX_PIXELS)
            reject(
              new Error(
                `${file.name}: de afbeelding is te groot. Gebruik een screenshot van maximaal 16 megapixels.`,
              ),
            );
          else resolve();
        };
        image.onerror = () =>
          reject(
            new Error(
              `${file.name}: dit bestand kan niet als afbeelding worden gelezen. Kies een nieuw PNG-, JPEG- of WebP-bestand.`,
            ),
          );
        image.src = url;
      });
    } finally {
      signal?.removeEventListener("abort", abort);
      image.onload = null;
      image.onerror = null;
      image.src = "";
      URL.revokeObjectURL(url);
    }
  }
}
