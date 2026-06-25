/**
 * Browser fetch helper that talks to the NestJS API mounted at /api.
 * Always sends cookies (the session cookie is HttpOnly) and JSON encodes bodies.
 */
import { createServerOnlyFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import {
  DEFAULT_LOCALE,
  getInitialLocale,
  hasStoredLocalePreference,
  I18N_LOCALE_SOURCE_STORAGE_KEY,
  I18N_STORAGE_KEY,
  localeFromLanguagePreference,
} from "@/lib/i18n";

export interface ApiError extends Error {
  status: number;
  payload?: unknown;
}

export class HttpError extends Error implements ApiError {
  status: number;
  payload?: unknown;
  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.payload = payload;
  }
}

export interface ApiOptions extends RequestInit {
  json?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  forwardServerCookies?: boolean;
}

const getServerRequestHeaders = createServerOnlyFn(() => {
  try {
    const request = getRequest();
    const rawCookieLocale = request.headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${I18N_STORAGE_KEY}=`))
      ?.split("=")
      .slice(1)
      .join("=");
    const cookieParts =
      request.headers
        .get("cookie")
        ?.split(";")
        .map((part) => part.trim()) ?? [];
    const hasExplicitCookieLocale =
      cookieParts.includes(`${I18N_LOCALE_SOURCE_STORAGE_KEY}=explicit`) ||
      cookieParts.includes(`${I18N_STORAGE_KEY}.explicit=1`);
    const cookieLocale = rawCookieLocale ? decodeURIComponent(rawCookieLocale) : undefined;
    return {
      cookie: request.headers.get("cookie") ?? undefined,
      origin: new URL(request.url).origin,
      acceptLanguage: hasExplicitCookieLocale
        ? cookieLocale
        : localeFromLanguagePreference(request.headers.get("accept-language")),
      localeSource: hasExplicitCookieLocale ? "explicit" : "device",
    };
  } catch {
    return {};
  }
});

function getClientAcceptLanguage() {
  if (typeof window === "undefined") return undefined;
  return getInitialLocale();
}

function getClientLocaleSource() {
  if (typeof window === "undefined") return undefined;
  return hasStoredLocalePreference() ? "explicit" : "device";
}

function buildQuery(query?: ApiOptions["query"]): string {
  if (!query) return "";
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { json, query, headers, forwardServerCookies, ...rest } = opts;
  const serverHeaders =
    typeof window === "undefined" && forwardServerCookies
      ? (getServerRequestHeaders() ?? {})
      : {};
  const relativeUrl = `${path.startsWith("/") ? "" : "/"}${path}${buildQuery(query)}`;
  const url =
    typeof window === "undefined" && serverHeaders.origin
      ? `${serverHeaders.origin}${relativeUrl}`
      : relativeUrl;
  const init: RequestInit = {
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Accept-Language": serverHeaders.acceptLanguage ?? getClientAcceptLanguage() ?? DEFAULT_LOCALE,
      "X-Megick-Locale-Source": serverHeaders.localeSource ?? getClientLocaleSource() ?? "device",
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(serverHeaders.cookie ? { Cookie: serverHeaders.cookie } : {}),
      ...(headers ?? {}),
    },
    ...rest,
  };
  if (json !== undefined) {
    init.body = JSON.stringify(json);
  }
  const res = await fetch(url, init);
  const ct = res.headers.get("content-type") ?? "";
  const isJson = ct.includes("application/json");
  const payload = isJson ? await res.json().catch(() => null) : await res.text().catch(() => "");

  if (!res.ok) {
    const message =
      (isJson && payload && typeof payload === "object" && "message" in (payload as object)
        ? String((payload as { message?: unknown }).message)
        : null) ?? `Request failed with status ${res.status}`;
    throw new HttpError(message, res.status, payload);
  }
  return payload as T;
}

export const apiGet = <T = unknown>(path: string, opts?: Omit<ApiOptions, "method">) =>
  api<T>(path, { ...opts, method: "GET" });

export const apiPost = <T = unknown>(
  path: string,
  json?: unknown,
  opts?: Omit<ApiOptions, "method" | "json">,
) => api<T>(path, { ...opts, method: "POST", json });

export const apiPatch = <T = unknown>(
  path: string,
  json?: unknown,
  opts?: Omit<ApiOptions, "method" | "json">,
) => api<T>(path, { ...opts, method: "PATCH", json });

export const apiDelete = <T = unknown>(path: string, opts?: Omit<ApiOptions, "method">) =>
  api<T>(path, { ...opts, method: "DELETE" });
