import { ImageResponse } from 'next/og';
import { brand, home } from '@/content/strings';

export const alt = home.metaTitle;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#FAF9F7',
          padding: 72,
          alignItems: 'center',
          justifyContent: 'space-between',
          fontFamily: 'Georgia, serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 680 }}>
          <div style={{ fontSize: 28, letterSpacing: 6, color: '#1E675D', textTransform: 'uppercase' }}>{brand.name}</div>
          <div style={{ fontSize: 72, lineHeight: 1.05, color: '#1C1A18', marginTop: 24 }}>{home.heroTitle}</div>
          <div style={{ fontSize: 28, color: '#5E5850', marginTop: 28 }}>{brand.tagline}</div>
        </div>
        <div
          style={{
            width: 300,
            height: 460,
            borderTopLeftRadius: 150,
            borderTopRightRadius: 150,
            background: '#6B1F2A',
            display: 'flex',
          }}
        />
      </div>
    ),
    size,
  );
}
