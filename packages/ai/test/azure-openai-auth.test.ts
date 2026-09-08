import { describe, expect, it, vi } from "vitest";
import type { AuthContext, AuthEvent, AuthPrompt } from "../src/auth/types.ts";
import { azureOpenAIResponsesProvider } from "../src/providers/azure-openai-responses.ts";

const signal = new AbortController().signal;

function authContext(values: Record<string, string | undefined>): AuthContext {
	return {
		env: async (name) => values[name],
		fileExists: async () => false,
	};
}

describe("Azure OpenAI authentication", () => {
	it("resolves API keys before ambient Microsoft Entra ID", async () => {
		const auth = azureOpenAIResponsesProvider().auth.apiKey!;
		const result = await auth.resolve({
			ctx: authContext({ AZURE_OPENAI_API_KEY: "api-key", AZURE_OPENAI_USE_AAD: "true" }),
			signal,
		});

		expect(result).toEqual({ auth: { apiKey: "api-key" }, source: "AZURE_OPENAI_API_KEY" });
	});

	it("resolves ambient Microsoft Entra ID without storing an access token", async () => {
		const auth = azureOpenAIResponsesProvider().auth.apiKey!;
		const result = await auth.resolve({
			ctx: authContext({ AZURE_OPENAI_USE_AAD: "1" }),
			signal,
		});

		expect(result).toEqual({ auth: {}, source: "Microsoft Entra ID" });
		expect(await auth.check?.({ ctx: authContext({ AZURE_OPENAI_USE_AAD: "1" }), signal })).toEqual({
			type: "api_key",
			source: "Microsoft Entra ID",
		});
	});

	it("stores an opt-in marker when Microsoft Entra ID is selected during login", async () => {
		const auth = azureOpenAIResponsesProvider().auth.apiKey!;
		const notifications: AuthEvent[] = [];
		const prompt = vi.fn(async (_prompt: AuthPrompt) => "entra-id");

		const credential = await auth.login?.({ signal, prompt, notify: (event) => notifications.push(event) });

		expect(credential).toEqual({ type: "api_key", env: { AZURE_OPENAI_USE_AAD: "true" } });
		expect(prompt).toHaveBeenCalledWith(expect.objectContaining({ type: "select" }));
		expect(notifications).toEqual([
			expect.objectContaining({ type: "info", message: expect.stringContaining("default Azure credential chain") }),
		]);
	});
});
