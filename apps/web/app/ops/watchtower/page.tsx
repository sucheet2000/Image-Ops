import type { Metadata } from 'next';
import { WatchTowerShell } from '../../components/watchtower-shell';

export const metadata: Metadata = {
  title: 'Watch Tower | Image Ops',
  description: 'Operator incident console for live application logs and payload debugging.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function OpsWatchTowerPage() {
  return <WatchTowerShell />;
}
