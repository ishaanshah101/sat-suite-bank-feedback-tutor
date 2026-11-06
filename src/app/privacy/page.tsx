import Link from "next/link";

export const metadata = { title: "Privacy · Rulecard" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-sm leading-6">
      <Link href="/signin" className="text-xs font-semibold uppercase tracking-widest text-muted hover:text-ink">
        Rulecard
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Privacy policy</h1>
      <p className="mt-1 text-muted">Last updated November 4, 2026.</p>

      <h2 className="mt-8 text-base font-semibold">What Rulecard collects</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Your email address and a salted hash of your password (never the password itself).</li>
        <li>
          The SAT practice questions (Reading and Writing or Math) you send it. In the Chrome extension, that is one screenshot of the tab
          you are on, taken only when you press &quot;Capture this tab&quot; (or click the Rulecard icon with the panel open). On a My Practice
          question page it reads the question&apos;s text instead (with a screenshot when the question has a graph). On the website you can
          also send a PDF page, an image or pasted text. Rulecard reads the question out of it, including equations and a written
          description of any graph, table or figure, and saves that text, not the picture.
        </li>
        <li>Your answer choice or typed answer, any reasoning you type, the explanations, chat messages and practice drills that follow.</li>
        <li>A count of AI requests per account, for the daily limit, and a short-lived record of sign-in tries per network address, to slow down password guessing.</li>
      </ul>

      <h2 className="mt-8 text-base font-semibold">How it is used</h2>
      <p className="mt-2">
        Only to give you feedback and to show you your own history. Question text and your answers are sent to an AI model provider (OpenAI,
        Anthropic or Google, through Vercel&apos;s AI Gateway) to write the explanation. Rulecard does not sell data, show ads, or share it for
        any other purpose. The extension looks at a tab only when you press Capture (or click its toolbar icon with the panel open), and
        only that one tab, at that moment. It never reads pages in the background.
      </p>

      <h2 className="mt-8 text-base font-semibold">Where it is stored</h2>
      <p className="mt-2">
        In a Supabase Postgres database in the United States, served by Vercel. The Chrome extension keeps your sign-in token in the
        browser&apos;s extension storage on your device. It also keeps a study log on your device for its offline features (progress, review
        schedule, flashcards, notes, badges, quizzes and exports). That log is never uploaded; the Erase local data button in the panel&apos;s
        settings removes it. Daily reminders are off unless you turn them on, and only then does the extension ask for permission to show
        notifications.
      </p>

      <h2 className="mt-8 text-base font-semibold">Deleting your data</h2>
      <p className="mt-2">
        Open the Account page and choose Delete account. Your account and everything saved to it are removed right away.
      </p>

      <h2 className="mt-8 text-base font-semibold">Contact</h2>
      <p className="mt-2">Questions about this policy: open an issue on the project&apos;s GitHub repository.</p>
    </main>
  );
}
