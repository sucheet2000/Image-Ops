'use client';

import { useEffect, useState } from 'react';
import { AdConsentBanner, useAdConsent } from './components/ad-consent-banner';
import { AdSlot } from './components/ad-slot';
import { getViewerSession, type ViewerPlan } from './lib/session';

export function HomeAds() {
  const adsEnabled = process.env.NEXT_PUBLIC_ENABLE_ADS === 'true';
  const [consent, setConsent] = useAdConsent();
  const [plan, setPlan] = useState<ViewerPlan>('free');

  useEffect(() => {
    setPlan(getViewerSession().plan);
  }, []);

  if (!adsEnabled) {
    return null;
  }

  return (
    <section className="full-bleed-section">
      <div className="section-inner" style={{ display: 'grid', gap: '1rem', marginTop: '1.5rem' }}>
        <AdConsentBanner
          consent={consent}
          onAccept={() => setConsent('accepted')}
          onReject={() => setConsent('rejected')}
        />
        <AdSlot plan={plan} consent={consent} placement="homepage-top" />
        <AdSlot plan={plan} consent={consent} placement="homepage-bottom" />
      </div>
    </section>
  );
}
