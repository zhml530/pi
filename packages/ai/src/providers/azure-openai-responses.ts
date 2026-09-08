import { azureOpenAIResponsesApi } from "../api/azure-openai-responses.lazy.ts";
import type { ApiKeyAuth } from "../auth/types.ts";
import { createProvider, type Provider } from "../models.ts";
import { AZURE_OPENAI_RESPONSES_MODELS } from "./azure-openai-responses.models.ts";

const AZURE_OPENAI_USE_AAD = "AZURE_OPENAI_USE_AAD";

function isEnabled(value: string | undefined): boolean {
	return value === "1" || value?.toLowerCase() === "true";
}

const azureOpenAIAuth: ApiKeyAuth = {
	name: "Azure OpenAI credentials",
	login: async (interaction) => {
		const method = await interaction.prompt({
			type: "select",
			message: "Select Azure OpenAI authentication method:",
			options: [
				{ id: "api-key", label: "API key" },
				{
					id: "entra-id",
					label: "Microsoft Entra ID",
					description: "Azure CLI, managed identity, or workload identity",
				},
			],
		});
		interaction.signal.throwIfAborted();
		if (method === "api-key") {
			return {
				type: "api_key",
				key: await interaction.prompt({ type: "secret", message: "Enter Azure OpenAI API key" }),
			};
		}
		if (method !== "entra-id") throw new Error(`Unknown Azure OpenAI authentication method: ${method}`);
		interaction.notify({
			type: "info",
			message: "Azure OpenAI will use the default Azure credential chain.",
			links: [
				{
					label: "DefaultAzureCredential",
					url: "https://learn.microsoft.com/javascript/api/@azure/identity/defaultazurecredential",
				},
			],
		});
		return { type: "api_key", env: { [AZURE_OPENAI_USE_AAD]: "true" } };
	},
	check: async ({ ctx, credential, signal }) => {
		const env = async (name: string) => {
			signal.throwIfAborted();
			const value = await ctx.env(name);
			signal.throwIfAborted();
			return value;
		};
		if (credential?.key) return { type: "api_key", source: "stored credential" };
		if (isEnabled(credential?.env?.[AZURE_OPENAI_USE_AAD])) {
			return { type: "api_key", source: "Microsoft Entra ID" };
		}
		if (await env("AZURE_OPENAI_API_KEY")) return { type: "api_key", source: "AZURE_OPENAI_API_KEY" };
		if (isEnabled(await env(AZURE_OPENAI_USE_AAD))) {
			return { type: "api_key", source: "Microsoft Entra ID" };
		}
		return undefined;
	},
	resolve: async ({ ctx, credential, signal }) => {
		const env = async (name: string) => {
			signal.throwIfAborted();
			const value = await ctx.env(name);
			signal.throwIfAborted();
			return value;
		};
		if (credential?.key) {
			return { auth: { apiKey: credential.key }, env: credential.env, source: "stored credential" };
		}
		if (isEnabled(credential?.env?.[AZURE_OPENAI_USE_AAD])) {
			return { auth: {}, env: credential?.env, source: "Microsoft Entra ID" };
		}
		const apiKey = await env("AZURE_OPENAI_API_KEY");
		if (apiKey) return { auth: { apiKey }, source: "AZURE_OPENAI_API_KEY" };
		if (isEnabled(await env(AZURE_OPENAI_USE_AAD))) {
			return { auth: {}, source: "Microsoft Entra ID" };
		}
		return undefined;
	},
};

export function azureOpenAIResponsesProvider(): Provider<"azure-openai-responses"> {
	return createProvider({
		id: "azure-openai-responses",
		name: "Azure OpenAI",
		auth: { apiKey: azureOpenAIAuth },
		models: Object.values(AZURE_OPENAI_RESPONSES_MODELS),
		api: azureOpenAIResponsesApi(),
	});
}
