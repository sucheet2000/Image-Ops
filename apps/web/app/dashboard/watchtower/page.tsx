import type { Metadata } from 'next';
import { WatchTowerShell } from '../../components/watchtower-shell';

export const metadata: Metadata = {
  title: 'Watch Tower | Image Ops',
  description: 'Live log visualization for incident investigation and operational debugging.',
};

export default function WatchTowerPage() {
  return <WatchTowerShell />;
}
