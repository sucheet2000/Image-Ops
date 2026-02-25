'use client';

import type { ViewerPlan } from '../lib/session';
import type { AdConsent } from './ad-consent-banner';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

const ADSENSE_SCRIPT_ID = 'image-ops-adsense-script';

function resolveAdSlotId(placement: string): string {
  if (placement === 'homepage-top') {
    return process.env.NEXT_PUBLIC_ADSENSE_SLOT_HOMEPAGE_TOP || '';
  }
  if (placement === 'homepage-bottom') {
    return process.env.NEXT_PUBLIC_ADSENSE_SLOT_HOMEPAGE_BOTTOM || '';
  }
  return process.env.NEXT_PUBLIC_ADSENSE_SLOT_DEFAULT || '';
}

async function ensureAdsenseScript(clientId: string): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  const existing = document.getElementById(ADSENSE_SCRIPT_ID);
  if (existing) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.id = ADSENSE_SCRIPT_ID;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(clientId)}`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load ad network script.'));
    document.head.appendChild(script);
  });
}

export function AdSlot(props: {
  plan: ViewerPlan;
  consent: AdConsent;
  placement: string;
}): ReactNode {
  const [adState, setAdState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [adMessage, setAdMessage] = useState('');
  const clientId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID || '';
  const adNetwork = process.env.NEXT_PUBLIC_AD_NETWORK || '';
  const slotId = resolveAdSlotId(props.placement);

  useEffect(() => {
    let cancelled = false;

    const mountAd = async () => {
      if (props.plan !== 'free' || props.consent !== 'accepted') {
        return;
      }

      if (adNetwork !== 'adsense') {
        setAdState('error');
        setAdMessage('Ad network not configured.');
        return;
      }

      if (!clientId || !slotId) {
        setAdState('error');
        setAdMessage('Missing NEXT_PUBLIC_ADSENSE_CLIENT_ID or slot id.');
        return;
      }

      setAdState('loading');
      try {
        await ensureAdsenseScript(clientId);
        if (cancelled) {
          return;
        }

        window.adsbygoogle = window.adsbygoogle || [];
        window.adsbygoogle.push({});
        setAdState('ready');
      } catch (error) {
        if (!cancelled) {
          setAdState('error');
          setAdMessage(error instanceof Error ? error.message : 'Ad slot initialization failed.');
        }
      }
    };

    void mountAd();
    return () => {
      cancelled = true;
    };
  }, [adNetwork, clientId, props.consent, props.plan, slotId]);

  if (props.plan !== 'free') {
    return (
      <section
        className="editorial-card ad-block ad-block--disabled"
        aria-label="Ad slot hidden for paid plan"
      >
        <span className="section-label">Sponsored</span>
        <h3>No Ads on Paid Plans</h3>
        <p>Upgrade benefit active. This slot stays disabled for {props.plan.toUpperCase()}.</p>
      </section>
    );
  }

  if (props.consent !== 'accepted') {
    return (
      <section
        className="editorial-card ad-block ad-block--disabled"
        aria-label="Ad slot awaiting consent"
      >
        <span className="section-label">Sponsored</span>
        <h3>Ads Paused</h3>
        <p>Grant consent to render ads in this placement.</p>
      </section>
    );
  }

  return (
    <section className="editorial-card ad-block" aria-label={`Ad slot ${props.placement}`}>
      <span className="section-label">Sponsored</span>
      <h3>Sponsored</h3>
      <p>Placement: {props.placement}</p>
      <ins
        className="adsbygoogle ad-slot"
        style={{ display: 'block' }}
        data-ad-client={clientId}
        data-ad-slot={slotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
      {adState === 'loading' ? <p className="ad-note">Loading sponsored placement...</p> : null}
      {adState === 'error' ? (
        <p className="ad-note">{adMessage || 'Ad slot unavailable.'}</p>
      ) : null}
    </section>
  );
}
