import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/chatMessageCache", () => ({
  clearChatMessageCache: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/queryPersister", () => ({
  clearPersistedQueryClient: vi.fn().mockRejectedValue(new Error("idb down")),
}));

import { clearChatMessageCache } from "@/lib/chatMessageCache";
import { clearUserCaches } from "./clearUserCaches";

describe("clearUserCaches", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("deletes user-bound SW caches but keeps the static shell, even if another layer fails", async () => {
    const deleted: string[] = [];
    vi.stubGlobal("caches", {
      keys: async () => [
        "christapp-static-v9",
        "christapp-runtime-v9",
        "christapp-api-swr-v9",
      ],
      delete: async (key: string) => {
        deleted.push(key);
        return true;
      },
    });

    await expect(clearUserCaches()).resolves.toBeUndefined();

    expect(deleted.sort()).toEqual(["christapp-api-swr-v9", "christapp-runtime-v9"]);
    expect(clearChatMessageCache).toHaveBeenCalled();
  });
});
