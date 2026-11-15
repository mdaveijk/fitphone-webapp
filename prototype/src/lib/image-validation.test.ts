import { afterEach, describe, expect, it, vi } from "vitest";
import { validateImageContents } from "./image-validation";

const image = () => new File(["synthetic"], "test.png", { type: "image/png" });
function setup(mode: "valid" | "invalid" | "oversized" | "pending") {
  class FakeImage {
    naturalWidth = mode === "oversized" ? 10000 : 900;
    naturalHeight = mode === "oversized" ? 10000 : 1150;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(value: string) {
      if (!value || mode === "pending") return;
      queueMicrotask(() =>
        mode === "invalid" ? this.onerror?.() : this.onload?.(),
      );
    }
  }
  vi.stubGlobal("Image", FakeImage);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
  return vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("actual image decoding", () => {
  it("accepts decodable screenshots and releases the temporary URL", async () => {
    const revoke = setup("valid");
    await expect(validateImageContents([image()])).resolves.toBeUndefined();
    expect(revoke).toHaveBeenCalledWith("blob:test");
  });
  it("rejects corrupt images and releases the URL", async () => {
    const revoke = setup("invalid");
    await expect(validateImageContents([image()])).rejects.toThrow(
      "niet als afbeelding",
    );
    expect(revoke).toHaveBeenCalledOnce();
  });
  it("rejects excessive image dimensions", async () => {
    setup("oversized");
    await expect(validateImageContents([image()])).rejects.toThrow(
      "16 megapixels",
    );
  });
  it("cancels decoding and releases resources", async () => {
    const revoke = setup("pending");
    const controller = new AbortController();
    const result = validateImageContents([image()], controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(revoke).toHaveBeenCalledOnce();
  });
});
