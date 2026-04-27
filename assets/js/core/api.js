export const API_BASE = "/api";
export const AUTH_TOKEN_STORAGE_KEY = "heladeria-mesa-auth-token";
export const AUTH_USER_STORAGE_KEY = "heladeria-mesa-auth-user";
export const AUTH_LAST_ACTIVITY_STORAGE_KEY = "heladeria-mesa-auth-last-activity";
export const AUTH_INACTIVITY_LIMIT_MS = 10 * 60 * 1000;
export const AUTH_ACTIVITY_WRITE_THROTTLE_MS = 15000;

export function buildApiUrl(path) {
  const normalizedPath = String(path || "").trim();
  if (!normalizedPath || normalizedPath === "/") {
    return API_BASE;
  }
  return `${API_BASE}${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`;
}

export function getSavedAuthToken() {
  try {
    return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || "";
  } catch (error) {
    return "";
  }
}

export function getSavedAuthUser() {
  try {
    const rawValue = window.localStorage.getItem(AUTH_USER_STORAGE_KEY) || "";
    return rawValue ? JSON.parse(rawValue) : null;
  } catch (error) {
    return null;
  }
}

export function getSavedSessionLastActivity() {
  try {
    return Number(window.localStorage.getItem(AUTH_LAST_ACTIVITY_STORAGE_KEY) || 0);
  } catch (error) {
    return 0;
  }
}

function resolveUrl(value) {
  try {
    return new URL(String(value || ""), window.location.origin);
  } catch (error) {
    return null;
  }
}

function isApiRequestTarget(input) {
  const rawUrl = typeof input === "string" ? input : String(input?.url || "");
  const resolvedUrl = resolveUrl(rawUrl);
  if (!resolvedUrl || !/^https?:$/i.test(resolvedUrl.protocol)) {
    return false;
  }

  const currentOrigin = resolveUrl(window.location.origin);
  const pathname = String(resolvedUrl.pathname || "");
  if (!currentOrigin || resolvedUrl.origin !== currentOrigin.origin) {
    return false;
  }

  return pathname === API_BASE || pathname.startsWith(`${API_BASE}/`);
}

function getAuthTokenExpiration(token) {
  try {
    const [encodedPayload] = String(token || "").split(".");
    if (!encodedPayload) {
      return 0;
    }
    const payload = JSON.parse(atob(encodedPayload.replace(/-/g, "+").replace(/_/g, "/")));
    return Number(payload?.exp || 0);
  } catch (error) {
    return 0;
  }
}

function shouldPersistRefreshedAuthToken(currentToken, refreshedToken) {
  if (!refreshedToken) {
    return false;
  }
  if (!currentToken) {
    return true;
  }
  return getAuthTokenExpiration(refreshedToken) >= getAuthTokenExpiration(currentToken);
}

export function installAuthenticatedFetch({ getToken, persistToken, onUnauthorized }) {
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const nextInit = { ...init };
    const headers = new Headers(init.headers || {});
    const currentToken = String(getToken?.() || "").trim();

    if (currentToken && isApiRequestTarget(input) && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${currentToken}`);
    }

    nextInit.headers = headers;
    const response = await nativeFetch(input, nextInit);
    const refreshedToken = isApiRequestTarget(input)
      ? String(response.headers.get("X-Auth-Token") || "").trim()
      : "";

    if (shouldPersistRefreshedAuthToken(currentToken, refreshedToken)) {
      persistToken?.(refreshedToken);
    }

    if (
      response.status === 401
      && isApiRequestTarget(input)
      && !String(typeof input === "string" ? input : input?.url || "").includes("/auth/")
    ) {
      onUnauthorized?.();
    }

    return response;
  };
}

export async function readJsonResponseSafe(response) {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();

  try {
    if (contentType.includes("application/json") || contentType.includes("text/json")) {
      return await response.json();
    }

    const rawText = await response.text();
    const trimmedText = String(rawText || "").trim();
    if (!trimmedText) {
      return null;
    }
    if (trimmedText.startsWith("{") || trimmedText.startsWith("[")) {
      return JSON.parse(trimmedText);
    }
  } catch (error) {
    return null;
  }

  return null;
}

export async function fetchRuntimeEnvironment({ setRuntimeEnvironment }) {
  try {
    const response = await window.fetch(buildApiUrl("/health"), { cache: "no-cache" });
    if (!response.ok) {
      return null;
    }

    const healthStatus = await readJsonResponseSafe(response);
    const isValidApiHealth = Boolean(
      healthStatus
      && healthStatus.ok === true
      && String(healthStatus.service || "").trim() === "heladeria-mesa-api"
    );

    if (!isValidApiHealth) {
      return null;
    }

    setRuntimeEnvironment?.(healthStatus?.environment);
    return healthStatus;
  } catch (error) {
    return null;
  }
}
