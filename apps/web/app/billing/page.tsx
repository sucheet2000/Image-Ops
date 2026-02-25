import type { Metadata } from 'next';
import { BillingShell } from '../components/billing-shell';

export const metadata: Metadata = {
  title: 'Billing | Image Ops',
  description: 'Manage your Image Ops plan and launch secure checkout for PRO or TEAM.',
};

export default function BillingPage() {
  return <BillingShell />;
}
