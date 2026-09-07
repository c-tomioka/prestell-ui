// User-facing text for the chat panel's error and setup notices.
//
// Everything the user reads about a failure is composed here from a code and
// its parameters (`error-codes.ts`), so this file is the single place to edit
// wording and, later, the seed of a translation table.
import type { CodedError, LocalProvider } from "./error-codes";

export const LOCAL_PROVIDER_NAMES: Record<LocalProvider, string> = {
	ollama: "Ollama",
	lmstudio: "LM Studio",
};

/** How to start the local server, per provider. */
const START_LOCAL_SERVER: Record<LocalProvider, string> = {
	ollama: "Run `ollama serve`",
	lmstudio: "In LM Studio, open the Developer tab and press Start Server",
};

/** Text for a coded error from `/api/chat`. */
export function describeCodedError(error: CodedError): string {
	switch (error.code) {
		case "local-unreachable":
			return `Cannot reach ${LOCAL_PROVIDER_NAMES[error.provider]} at ${error.base}. ${START_LOCAL_SERVER[error.provider]}, then retry.`;
		case "timeout":
			return `The model did not respond in time (${error.detail}). Retry, or pick another model or provider.`;
	}
}

/** Shown under the model field when `/api/models` cannot reach the local server. */
export function localServerHint(provider: LocalProvider): string {
	return provider === "ollama"
		? "Ollama is not running or has no models. Run `ollama serve` and pull a model with `ollama pull <model>`."
		: "The LM Studio server is not running. In LM Studio, open the Developer tab, press Start Server, and load a model.";
}

/** Shown when the local server answered but lists no models. */
export const NO_LOCAL_MODELS =
	"No models found on the local server. Pull or load a model, then reload.";
