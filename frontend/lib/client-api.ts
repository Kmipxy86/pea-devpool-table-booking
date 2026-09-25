// ใช้ใน Client Component: เรียก /api/... (origin เดียวกัน) แล้ว Next.js proxy ไป Go
// browser แนบ cookie session ให้เอง

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  const res = await fetch(path, {
    ...init,
    headers: isForm ? init.headers : { "Content-Type": "application/json", ...init.headers },
    credentials: "same-origin",
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "เกิดข้อผิดพลาด กรุณาลองใหม่");
  return data as T;
}
