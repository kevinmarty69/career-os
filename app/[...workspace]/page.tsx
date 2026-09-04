import { KitRoutePage } from '@/components/kit-route-page';

export default async function WorkspaceRoute({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ workspace }, query] = await Promise.all([params, searchParams]);
  return <KitRoutePage path={`/${workspace.join('/')}`} query={query} />;
}
