import { redirect } from 'next/navigation';

export default async function ReplayRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/chess/analysis?gameId=${id}`);
}
