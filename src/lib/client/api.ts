"use client";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data: { error?: string; code?: string } & T;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ApiError(response.status, text || response.statusText);
  }
  if (!response.ok) {
    if (response.status === 401) {
      window.location.assign(new URL("/unlock", window.location.origin).href);
    }
    throw new ApiError(response.status, data.error ?? "Request failed", data.code);
  }
  return data;
}
