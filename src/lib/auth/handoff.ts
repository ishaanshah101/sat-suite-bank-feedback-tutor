import "server-only";
import { getUser } from "@/db/queries";
import { verifyHandoffCode } from "./token";

/** Where a handoff may land: a same-site path, nothing that could leave the origin. */
export function safeNextPath(param: string | null | undefined): string {
  const next = param ?? "/";
  return /^\/(?![/\\])[\w\-/#?=&.%]*$/.test(next) ? next : "/";
}

export interface ResolvedHandoff {
  userId: string;
  email: string;
  jti: string;
}

/** The account a handoff code names, when the code is valid and the account still exists. Does not consume it. */
export async function resolveHandoff(code: string | null | undefined): Promise<ResolvedHandoff | null> {
  const handoff = await verifyHandoffCode(code ?? "");
  if (!handoff) return null;
  const user = await getUser(handoff.userId);
  return user ? { userId: user.id, email: user.email, jti: handoff.jti } : null;
}
