import { z } from "zod";
import { cookies } from "next/headers";
import { HttpError, json, readJson, withApi } from "@/lib/api";
import { deleteUserAndData, getUser } from "@/db/queries";
import { verifyPassword } from "@/lib/auth/password";
import { SESSION_COOKIE } from "@/lib/auth/token";

export const runtime = "nodejs";

const Body = z.object({ password: z.string().min(1).max(200) });

/** Delete the signed-in account and all of its saved questions, attempts, chats and drills. Needs the password. */
export async function DELETE(request: Request) {
  return withApi(async (session) => {
    const body = Body.parse(await readJson(request, 16 * 1024));
    const user = await getUser(session.userId);
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) throw new HttpError(403, "That password is not right.", "bad_password");
    await deleteUserAndData(user.id);
    (await cookies()).delete(SESSION_COOKIE);
    return json({ deleted: true });
  });
}
