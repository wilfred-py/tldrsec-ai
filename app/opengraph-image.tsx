import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'tldrSEC - AI-Powered SEC Filing Summaries';
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
              gap: '16px',
              marginBottom: '32px',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px',
                fontWeight: 700,
                color: 'white',
              }}
            >
              S
            </div>
            <span
              style={{
                fontSize: '48px',
                fontWeight: 700,
                color: 'white',
                letterSpacing: '-1px',
              }}
            >
              tldrSEC
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
            AI-Powered SEC Filing Summaries
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
            10-K, 10-Q, 8-K &amp; Form 4 analysis delivered to your inbox
          </div>
          <div
            style={{
              display: 'flex',
              gap: '12px',
              marginTop: '40px',
            }}
          >
            <div style={{ padding: '8px 20px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#60a5fa', fontSize: '18px', fontWeight: 500 }}>10-K</div>
            <div style={{ padding: '8px 20px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#60a5fa', fontSize: '18px', fontWeight: 500 }}>10-Q</div>
            <div style={{ padding: '8px 20px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#60a5fa', fontSize: '18px', fontWeight: 500 }}>8-K</div>
            <div style={{ padding: '8px 20px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#60a5fa', fontSize: '18px', fontWeight: 500 }}>Form 4</div>
            <div style={{ padding: '8px 20px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#60a5fa', fontSize: '18px', fontWeight: 500 }}>13F</div>
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
