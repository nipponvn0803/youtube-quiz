import { describe, it, expect, vi, afterEach } from "vitest";
import { checkOnDeviceAvailability, downloadOnDeviceModel } from "../../src/shared/ondeviceAvailability";

afterEach(() => vi.unstubAllGlobals());

describe("checkOnDeviceAvailability", () => {
  it("returns 'unsupported' when the LanguageModel global doesn't exist", async () => {
    expect(await checkOnDeviceAvailability()).toBe("unsupported");
  });

  it("returns whatever LanguageModel.availability() resolves to", async () => {
    vi.stubGlobal("LanguageModel", {
      availability: vi.fn().mockResolvedValue("downloadable"),
    });

    expect(await checkOnDeviceAvailability()).toBe("downloadable");
  });

  it("returns 'unavailable' if availability() throws", async () => {
    vi.stubGlobal("LanguageModel", {
      availability: vi.fn().mockRejectedValue(new Error("boom")),
    });

    expect(await checkOnDeviceAvailability()).toBe("unavailable");
  });
});

describe("downloadOnDeviceModel", () => {
  it("throws when the LanguageModel global doesn't exist", async () => {
    await expect(downloadOnDeviceModel()).rejects.toThrow("not supported");
  });

  it("creates and destroys a session, reporting download progress", async () => {
    const destroy = vi.fn();
    let capturedMonitor: ((m: LanguageModelMonitor) => void) | undefined;

    const create = vi.fn().mockImplementation(async (options: LanguageModelCreateOptions) => {
      capturedMonitor = options.monitor;
      return { prompt: vi.fn(), destroy };
    });

    vi.stubGlobal("LanguageModel", { create });

    const onProgress = vi.fn();
    await downloadOnDeviceModel(onProgress);

    expect(create).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();

    // Simulate the browser firing a downloadprogress event through the captured monitor.
    let listener: ((e: LanguageModelDownloadProgressEvent) => void) | undefined;
    capturedMonitor?.({
      addEventListener: (_type, cb) => { listener = cb; },
    });
    listener?.({ loaded: 0.5 } as LanguageModelDownloadProgressEvent);

    expect(onProgress).toHaveBeenCalledWith(0.5);
  });
});
