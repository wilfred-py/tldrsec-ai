import { ImageResponse } from 'next/og';
import { OG_IMAGE } from '@/lib/landing/copy';

export const runtime = 'edge';
export const alt = OG_IMAGE.alt;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 86400;

export default async function Image() {
  try {
    return new ImageResponse(
      (
        <div
          style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'system-ui, sans-serif',
            padding: '60px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '20px',
              marginBottom: '32px',
            }}
          >
            {/* Stacked Pages icon (inline for Satori) */}
            <div style={{ display: 'flex', position: 'relative', width: '56px', height: '56px' }}>
              <div style={{ position: 'absolute', left: '16px', top: '0px', width: '36px', height: '44px', borderRadius: '4px', background: '#a78bfa', opacity: 0.3 }} />
              <div style={{ position: 'absolute', left: '8px', top: '5px', width: '36px', height: '44px', borderRadius: '4px', background: '#818cf8', opacity: 0.5 }} />
              <div style={{ position: 'absolute', left: '0px', top: '10px', width: '36px', height: '44px', borderRadius: '4px', background: 'linear-gradient(135deg, #60a5fa, #a78bfa)' }} />
            </div>
            <span
              style={{
                fontSize: '48px',
                fontWeight: 700,
                color: 'white',
                letterSpacing: '-1px',
              }}
            >
              tldr<span style={{ color: '#60a5fa' }}>SEC</span>
            </span>
          </div>
          <div
            style={{
              fontSize: '36px',
              fontWeight: 600,
              color: '#e2e8f0',
              textAlign: 'center',
              lineHeight: 1.3,
              maxWidth: '900px',
              marginBottom: '24px',
            }}
          >
            {OG_IMAGE.headline}
          </div>
          <div
            style={{
              fontSize: '22px',
              color: '#94a3b8',
              textAlign: 'center',
              maxWidth: '700px',
              lineHeight: 1.5,
            }}
          >
            {OG_IMAGE.subhead}
          </div>
          <div
            style={{
              display: 'flex',
              gap: '12px',
              marginTop: '40px',
            }}
          >
            {OG_IMAGE.filingTypeChips.map((chip) => (
              <div key={chip} style={{ padding: '8px 20px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#60a5fa', fontSize: '18px', fontWeight: 500 }}>{chip}</div>
            ))}
          </div>
        </div>
      ),
      { ...size }
    );
  } catch {
    return new ImageResponse(
      (
        <div
          style={{
            background: '#0f172a',
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '48px',
            fontWeight: 700,
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          tldrSEC
        </div>
      ),
      { ...size }
    );
  }
}
