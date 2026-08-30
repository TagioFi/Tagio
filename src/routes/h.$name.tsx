import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import HashtagDetail from "../pages/HashtagDetail";
import { getHashtag, getHashtagTransactions } from "../lib/tagio";

export const Route = createFileRoute("/h/$name")({
  loader: async ({ params }) => {
    const record = await getHashtag({ data: params.name });
    if (!record) throw notFound();
    const transactions = await getHashtagTransactions({ data: record.hashtag }).catch(
      () => [],
    );
    return { record, transactions };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `#${loaderData?.record.hashtag ?? "hashtag"} — Tagio` },
      { name: "description", content: "Onchain hashtag record on Solana." },
    ],
  }),
  notFoundComponent: NotRegistered,
  component: Page,
});

function Page() {
  const { record, transactions } = Route.useLoaderData();
  return <HashtagDetail record={record} transactions={transactions} />;
}

function NotRegistered() {
  const { name } = Route.useParams();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">
          #{name} isn't registered
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This hashtag has no active record on Solana. It may be available to
          claim.
        </p>
        <div className="mt-6">
          <Link
            to="/dashboard"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Check availability
          </Link>
        </div>
      </div>
    </div>
  );
}
