import type { Metadata } from "next";
import "./globals.css";

// Every page renders per request: the proxy issues a fresh script nonce each time, and static HTML could not carry it.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rulecard",
  description: "Rule-first feedback on SAT Reading and Writing and Math questions.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
