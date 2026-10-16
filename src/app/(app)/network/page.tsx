import type { Metadata } from 'next';
import NetworkPage from '~/components/network/page';

export const metadata: Metadata = { title: 'Network' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; tag?: string }>;
}) {
  return <NetworkPage searchParams={searchParams} />;
}
