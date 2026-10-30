import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONFIG_FILE_NAME, fetchCodexModels, loadMappedModels, resolveExtraHeaders } from "../extensions/lib.ts";

const tempDirs: string[] = [];

function tempAgentDir(config?: unknown): string {
	const dir = mkdtempSync(join(tmpdir(), "cliproxyapi-headers-"));
	tempDirs.push(dir);
	if (config !== undefined) {
		writeFileSync(join(dir, CONFIG_FILE_NAME), JSON.stringify(config), "utf8");
	}
	return dir;
}

afterEach(() => {
	vi.restoreAllMocks();
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("resolveExtraHeaders", () => {
	it("returns undefined when headers are absent or empty", () => {
		expect(resolveExtraHeaders(tempAgentDir())).toBeUndefined();
		expect(resolveExtraHeaders(tempAgentDir({ apiKey: "k" }))).toBeUndefined();
		expect(resolveExtraHeaders(tempAgentDir({ headers: {} }))).toBeUndefined();
	});

	it("returns configured headers", () => {
		const headers = { "CF-Access-Client-Id": "id", "CF-Access-Client-Secret": "secret" };
		expect(resolveExtraHeaders(tempAgentDir({ headers }))).toEqual(headers);
	});

	it("rejects non-object or non-string header values", () => {
		for (const headers of ["x", ["a"], null, { a: 1 }]) {
			expect(() => resolveExtraHeaders(tempAgentDir({ headers }))).toThrow(/"headers" must be an object/);
		}
	});
});

describe("model catalog request headers", () => {
	it("sends extra headers and keeps Authorization from the api key", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response(JSON.stringify({ models: [] }), { status: 200 }));

		await fetchCodexModels("http://127.0.0.1:8317/v1/models", "key", undefined, undefined, {
			"CF-Access-Client-Id": "id",
			Authorization: "Bearer other",
		});

		expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({
			"CF-Access-Client-Id": "id",
			Authorization: "Bearer key",
			Accept: "application/json",
		});
	});

	it("loadMappedModels reads headers from cliproxyapi.json", async () => {
		const agentDir = tempAgentDir({ headers: { "CF-Access-Client-Id": "id" } });
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response(JSON.stringify({ models: [] }), { status: 200 }));

		await loadMappedModels("http://127.0.0.1:8317", "key", false, agentDir);

		expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ "CF-Access-Client-Id": "id" });
	});
});
