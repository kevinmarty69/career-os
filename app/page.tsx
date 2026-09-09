import { HomeScreen } from '@/components/dashboard/home-screen';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ notifs?: string }>;
}) {
  const { notifs } = await searchParams;
  return (
    <HomeScreen
      key={notifs ?? 'home'}
      initiallyOpenNotifications={notifs === '1'}
    />
  );
}
