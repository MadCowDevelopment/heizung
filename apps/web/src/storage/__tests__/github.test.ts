import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyState } from "../../domain/types";
import {
  GitHubApiError,
  GitHubStorageAdapter,
  mergeAppStates,
  synchronisiereZustand,
} from "../github";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GitHubStorageAdapter", () => {
  it("round-trips UTF-8 contents and writes using the current blob SHA", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          content: btoa(unescape(encodeURIComponent("Grüße"))),
          sha: "blob-old",
        })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ content: { sha: "blob-new" } })),
      );
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new GitHubStorageAdapter("test-token", "owner/repo");

    await expect(adapter.read("data/state.json")).resolves.toBe("Grüße");
    await adapter.writeWithSha("data/state.json", "Änderung", "blob-old");

    const put = JSON.parse(fetchMock.mock.calls[1][1].body as string) as { sha: string; content: string };
    expect(put.sha).toBe("blob-old");
    expect(decodeURIComponent(escape(atob(put.content)))).toBe("Änderung");
  });

  it("merges records by updatedAt and retains soft-deleted records", () => {
    const local = emptyState();
    const remote = emptyState();
    local.updatedAt = "2026-01-02T00:00:00.000Z";
    remote.updatedAt = "2026-01-01T00:00:00.000Z";
    local.bewohner = [{ id: "resident", name: "Local", aktiv: true, updatedAt: local.updatedAt }];
    remote.bewohner = [
      { id: "resident", name: "Remote old", aktiv: true, updatedAt: remote.updatedAt },
      { id: "deleted", name: "Deleted", aktiv: false, deleted: true, updatedAt: remote.updatedAt },
    ];
    local.preis = [{
      id: "price",
      gueltigAb: "2026-01-01",
      preisMWh: 0.2,
      preisM3: 0,
      deleted: true,
      updatedAt: local.updatedAt,
    }];
    remote.preis = [{
      id: "price",
      gueltigAb: "2026-01-01",
      preisMWh: 0.1,
      preisM3: 0,
      updatedAt: remote.updatedAt,
    }];

    const result = mergeAppStates(local, remote);
    expect(result.bewohner).toEqual([
      local.bewohner[0],
      remote.bewohner[1],
    ]);
    expect(result.preis).toEqual(local.preis);
  });

  it("re-reads and retries after a GitHub SHA conflict", async () => {
    const initialRemote = emptyState();
    initialRemote.updatedAt = "2026-01-01T00:00:00.000Z";
    const newerRemote = emptyState();
    newerRemote.updatedAt = "2026-01-02T00:00:00.000Z";
    newerRemote.bewohner = [{ id: "remote", name: "Remote", aktiv: true, updatedAt: newerRemote.updatedAt }];
    const contentResponse = (state: typeof initialRemote, sha: string) =>
      new Response(JSON.stringify({
        content: btoa(JSON.stringify(state)),
        sha,
      }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(contentResponse(initialRemote, "sha-1"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "Conflict" }), { status: 409 }))
      .mockResolvedValueOnce(contentResponse(newerRemote, "sha-2"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ content: { sha: "sha-3" } })));
    vi.stubGlobal("fetch", fetchMock);

    const local = emptyState();
    local.updatedAt = "2026-01-03T00:00:00.000Z";
    local.zaehler = [{
      id: "local",
      bezeichnung: "Heizung",
      typ: "energie",
      einheit: "MWh",
      bewohnerId: null,
      enthaeltIds: [],
      aktiv: true,
      updatedAt: local.updatedAt,
    }];

    const result = await synchronisiereZustand(
      new GitHubStorageAdapter("test-token", "owner/repo"),
      local,
    );
    expect(result.bewohner.map((resident) => resident.id)).toContain("remote");
    expect(result.zaehler.map((meter) => meter.id)).toContain("local");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("surfaces non-conflict GitHub errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new GitHubStorageAdapter("bad-token", "owner/repo");
    await expect(adapter.read("data/state.json")).rejects.toBeInstanceOf(GitHubApiError);
  });
});
