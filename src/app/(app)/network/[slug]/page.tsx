import type { Metadata } from 'next';
import NetworkPostPage from '~/components/network/[slug]/page';

export const metadata: Metadata = { title: 'Network post' };

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <NetworkPostPage params={params} />;
}
