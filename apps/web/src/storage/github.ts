import type { AppState } from "../domain/types";
import { importiereJson } from "../domain/io/json";
import type { StorageAdapter } from "./adapter";

const API = "https://api.github.com";
const TOKEN_KEY = "heizung.token";
const API_VERSION = "2022-11-28";

export class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

export interface GitHubDatei {
  content: string;
  sha: string;
}

export function tokenLesen(): string {
  return globalThis.localStorage?.getItem(TOKEN_KEY) ?? "";
}

export function tokenSpeichern(token: string): void {
  if (!globalThis.localStorage) throw new Error("Local storage is not available.");
  if (token.trim()) globalThis.localStorage.setItem(TOKEN_KEY, token.trim());
  else globalThis.localStorage.removeItem(TOKEN_KEY);
}

export function gueltigesRepo(repo: string): boolean {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo);
}

async function api(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": API_VERSION,
      ...init.headers,
    },
  });
  if (!response.ok) {
    let message = `GitHub API request failed (${response.status}).`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // The status remains actionable even when GitHub returned no JSON body.
    }
    throw new GitHubApiError(response.status, message);
  }
  return response;
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function decodeBase64(value: string): string {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function isShaConflict(error: unknown): boolean {
  if (!(error instanceof GitHubApiError)) return false;
  if (error.status === 409) return true;
  return error.status === 422 &&
    /data\/state\.json does not match [a-f0-9]{40}\b/i.test(error.message);
}

export async function pruefeGitHubToken(token: string): Promise<string> {
  const response = await api(token, "/user");
  const user = (await response.json()) as { login?: string };
  if (!user.login) throw new Error("GitHub did not return a user name.");
  return user.login;
}

export class GitHubStorageAdapter implements StorageAdapter {
  readonly name = "github";

  constructor(
    private readonly token: string,
    private readonly repo: string,
  ) {
    if (!gueltigesRepo(repo)) throw new Error("Repository must use the owner/repo format.");
    if (!token.trim()) throw new Error("A GitHub token is required.");
  }

  private contentsUrl(path: string): string {
    const [owner, name] = this.repo.split("/");
    return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents/${encodePath(path)}`;
  }

  async readFile(path: string): Promise<GitHubDatei | null> {
    try {
      const response = await api(this.token, this.contentsUrl(path));
      const file = (await response.json()) as { content?: string; sha?: string };
      if (typeof file.content !== "string" || typeof file.sha !== "string") {
        throw new Error("GitHub returned an invalid contents response.");
      }
      return { content: decodeBase64(file.content), sha: file.sha };
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) return null;
      throw error;
    }
  }

  async writeWithSha(path: string, content: string, sha: string | null): Promise<string> {
    const response = await api(this.token, this.contentsUrl(path), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `sync ${new Date().toISOString()}`,
        content: encodeBase64(content),
        ...(sha ? { sha } : {}),
      }),
    });
    const result = (await response.json()) as { content?: { sha?: string } };
    const nextSha = result.content?.sha;
    if (!nextSha) throw new Error("GitHub did not return the updated file SHA.");
    return nextSha;
  }

  async list(): Promise<string[]> {
    return (await this.readFile("data/state.json")) ? ["data/state.json"] : [];
  }

  async read(path: string): Promise<string | null> {
    return (await this.readFile(path))?.content ?? null;
  }

  async write(path: string, content: string): Promise<void> {
    const current = await this.readFile(path);
    await this.writeWithSha(path, content, current?.sha ?? null);
  }

  async delete(path: string): Promise<void> {
    const current = await this.readFile(path);
    if (!current) return;
    await api(this.token, this.contentsUrl(path), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `delete ${path}`,
        sha: current.sha,
      }),
    });
  }
}

function mergeRecords<T extends { id: string; updatedAt?: string; createdAt?: string }>(
  local: T[],
  remote: T[],
  localDate: string,
  remoteDate: string,
): T[] {
  const records = new Map<string, T>();
  for (const record of remote) records.set(record.id, record);
  for (const record of local) {
    const existing = records.get(record.id);
    const incomingDate = record.updatedAt ?? record.createdAt ?? localDate;
    const existingDate = existing?.updatedAt ?? existing?.createdAt ?? remoteDate;
    if (!existing || incomingDate >= existingDate) records.set(record.id, record);
  }
  return [...records.values()];
}

export function mergeAppStates(local: AppState, remote: AppState): AppState {
  const localIsNewer = local.updatedAt >= remote.updatedAt;
  const newer = localIsNewer ? local : remote;
  return {
    ...newer,
    updatedAt: localIsNewer ? local.updatedAt : remote.updatedAt,
    bewohner: mergeRecords(local.bewohner, remote.bewohner, local.updatedAt, remote.updatedAt),
    zaehler: mergeRecords(local.zaehler, remote.zaehler, local.updatedAt, remote.updatedAt),
    ablesung: mergeRecords(local.ablesung, remote.ablesung, local.updatedAt, remote.updatedAt),
    preis: mergeRecords(local.preis, remote.preis, local.updatedAt, remote.updatedAt),
    abschlagPlan: mergeRecords(local.abschlagPlan, remote.abschlagPlan, local.updatedAt, remote.updatedAt),
    zahlung: mergeRecords(local.zahlung, remote.zahlung, local.updatedAt, remote.updatedAt),
    abrechnung: mergeRecords(local.abrechnung, remote.abrechnung, local.updatedAt, remote.updatedAt),
  };
}

export async function synchronisiereZustand(
  adapter: GitHubStorageAdapter,
  localState: AppState,
  retries = 3,
): Promise<AppState> {
  const path = "data/state.json";
  let next = localState;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const remoteFile = await adapter.readFile(path);
    if (remoteFile) {
      const remoteState = importiereJson(remoteFile.content);
      next = mergeAppStates(next, remoteState);
      if (JSON.stringify(next) === JSON.stringify(remoteState)) return next;
    }
    try {
      await adapter.writeWithSha(path, JSON.stringify(next, null, 2), remoteFile?.sha ?? null);
      return next;
    } catch (error) {
      if (!isShaConflict(error) || attempt === retries - 1) {
        throw error;
      }
    }
  }
  throw new Error("Could not synchronize after repeated SHA conflicts.");
}
