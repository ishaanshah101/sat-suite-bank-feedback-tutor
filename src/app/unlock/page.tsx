import { redirect } from "next/navigation";

/** The old passcode page; accounts replaced it. */
export default function UnlockPage() {
  redirect("/signin");
}
