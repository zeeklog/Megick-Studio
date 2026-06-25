import type { AuthConfigResponse } from "@megick/api-types";

export const DEFAULT_AUTH_CONFIG: AuthConfigResponse = {
  passwordLoginEnabled: true,
  registrationEnabled: true,
  registrationEmailVerificationEnabled: false,
  registrationDisabledMessage: "",
  oauthProviders: [],
  oauthProviderClientIds: {},
};

export const AUTH_CONFIG_QUERY_KEY = ["auth", "config"] as const;
