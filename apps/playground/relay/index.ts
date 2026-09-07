// Entry point of the Astro docs relay Worker. Config: `relay/wrangler.jsonc`.
//   pnpm relay:dev      → http://localhost:8788/search
//   pnpm relay:deploy   → your Workers account (Free plan is enough)
import { handleRequest, type RelayEnv } from "./handler";

export default {
	fetch(request: Request, env: RelayEnv): Promise<Response> {
		return handleRequest(request, env);
	},
};
