'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export type AdConsent = 'accepted' | 'rejected' | 'unset';

const CONSENT_KEY = 'image_ops_ad_consent';

function readConsent(): AdConsent {
  if (typeof window === 'undefined') {
    return 'unset';
  }
  const value = localStorage.getItem(CONSENT_KEY);
  if (value === 'accepted' || value === 'rejected') {
    return value;
  }
  return 'unset';
}

export function useAdConsent(): [AdConsent, (next: Exclude<AdConsent, 'unset'>) => void] {
  const [consent, setConsent] = useState<AdConsent>('unset');

  useEffect(() => {
    setConsent(readConsent());
  }, []);

  const updateConsent = (next: Exclude<AdConsent, 'unset'>) => {
    localStorage.setItem(CONSENT_KEY, next);
    setConsent(next);
  };

  return [consent, updateConsent];
}

export function AdConsentBanner(props: {
  consent: AdConsent;
  onAccept: () => void;
  onReject: () => void;
}): ReactNode {
  if (props.consent !== 'unset') {
    return null;
  }

  return (
    <section className="editorial-card" aria-label="Ad consent">
      <span className="section-label">Ads Consent</span>
      <h2>Ads Consent</h2>
      <p>
        Free plan uses ads to keep tools affordable. We only render ad slots after explicit consent.
      </p>
      <div className="workbench-actions">
        <button type="button" className="editorial-button accent" onClick={props.onAccept}>
          Allow Ads
        </button>
        <button type="button" className="editorial-button ghost" onClick={props.onReject}>
          No Thanks
        </button>
      </div>
    </section>
  );
}
