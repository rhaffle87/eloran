import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

async function generateAssets() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // 1. Generate 180x180 apple-touch-icon.png
  await page.setViewportSize({ width: 180, height: 180 });
  const touchIconSvg = fs.readFileSync('public/favicon.svg', 'utf8');
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { width: 180px; height: 180px; background: #090a0c; display: flex; align-items: center; justify-content: center; }
          svg { width: 180px; height: 180px; }
        </style>
      </head>
      <body>
        ${touchIconSvg}
      </body>
    </html>
  `);
  await page.screenshot({ path: 'public/apple-touch-icon.png', type: 'png' });
  console.log('✓ Generated public/apple-touch-icon.png (180x180)');

  // 2. Generate 32x32 favicon.png and packaging to favicon.ico
  await page.setViewportSize({ width: 32, height: 32 });
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { width: 32px; height: 32px; background: #090a0c; display: flex; align-items: center; justify-content: center; }
          svg { width: 32px; height: 32px; }
        </style>
      </head>
      <body>
        ${touchIconSvg}
      </body>
    </html>
  `);
  const png32Buffer = await page.screenshot({ type: 'png' });
  
  // Wrap PNG into a standard ICO file structure (1 image: 32x32 PNG)
  // ICO header: 2 bytes reserved (0), 2 bytes type (1 = ICO), 2 bytes count (1)
  // Directory entry: 16 bytes
  const icoHeader = Buffer.alloc(6);
  icoHeader.writeUInt16LE(0, 0);
  icoHeader.writeUInt16LE(1, 2);
  icoHeader.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry.writeUInt8(32, 0); // width
  entry.writeUInt8(32, 1); // height
  entry.writeUInt8(0, 2);  // color palette (0 = >= 8bpp)
  entry.writeUInt8(0, 3);  // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png32Buffer.length, 8); // image size
  entry.writeUInt32LE(6 + 16, 12); // image offset

  const icoBuffer = Buffer.concat([icoHeader, entry, png32Buffer]);
  fs.writeFileSync('public/favicon.ico', icoBuffer);
  console.log('✓ Generated public/favicon.ico (32x32 ICO wrapper)');

  // 3. Generate 1200x630 og-image.png
  await page.setViewportSize({ width: 1200, height: 630 });
  const ogHtml = `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          width: 1200px;
          height: 630px;
          background: #090a0c;
          font-family: 'Space Grotesk', -apple-system, sans-serif;
          color: #f3f4f6;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 64px 72px;
          position: relative;
          overflow: hidden;
        }

        /* Tactical background grid & radar arcs */
        .bg-grid {
          position: absolute;
          inset: 0;
          background-image: 
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 40px 40px;
          z-index: 0;
        }
        .radar-glow {
          position: absolute;
          top: -100px;
          right: -100px;
          width: 600px;
          height: 600px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(6, 182, 212, 0.15) 0%, rgba(6, 182, 212, 0.03) 50%, transparent 70%);
          z-index: 1;
        }

        .content {
          position: relative;
          z-index: 2;
          display: flex;
          flex-direction: column;
          height: 100%;
          justify-content: space-between;
        }

        .header-row {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .brand-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          border-radius: 8px;
          background: rgba(6, 182, 212, 0.1);
          border: 1px solid rgba(6, 182, 212, 0.3);
          font-family: 'JetBrains Mono', monospace;
          font-size: 14px;
          font-weight: 600;
          color: #06b6d4;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .pulse-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #06b6d4;
          box-shadow: 0 0 8px #06b6d4;
        }

        .main-hero {
          margin-top: 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 48px;
        }
        .title-col {
          flex: 1;
        }
        .title-row {
          display: flex;
          align-items: baseline;
          gap: 18px;
        }
        h1 {
          font-family: 'JetBrains Mono', monospace;
          font-size: 64px;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: #ffffff;
          line-height: 1.1;
        }
        .version-tag {
          font-family: 'JetBrains Mono', monospace;
          font-size: 24px;
          font-weight: 600;
          color: #06b6d4;
          padding: 4px 12px;
          border-radius: 6px;
          background: rgba(6, 182, 212, 0.12);
          border: 1px solid rgba(6, 182, 212, 0.3);
        }
        .subtitle {
          margin-top: 16px;
          font-size: 24px;
          font-weight: 500;
          line-height: 1.4;
          color: #94a3b8;
          max-width: 620px;
        }

        /* Tactical visual card */
        .tactical-card {
          width: 360px;
          height: 240px;
          border-radius: 12px;
          background: #11141a;
          border: 1px solid #1e293b;
          position: relative;
          overflow: hidden;
          padding: 16px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .card-header {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.05em;
          color: #64748b;
          display: flex;
          justify-content: space-between;
        }
        .waveform-svg {
          width: 100%;
          height: 120px;
        }
        .card-stats {
          display: flex;
          justify-content: space-between;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          color: #94a3b8;
          border-top: 1px solid #1e293b;
          padding-top: 8px;
        }
        .stat-val {
          color: #06b6d4;
          font-weight: 600;
        }

        /* Pillars & badges */
        .pillars {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 24px;
        }
        .pill {
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 13px;
          font-family: 'JetBrains Mono', monospace;
          background: #181a1f;
          border: 1px solid #272a30;
          color: #cbd5e1;
        }
        .pill.amber {
          border-color: rgba(245, 158, 11, 0.3);
          color: #f59e0b;
          background: rgba(245, 158, 11, 0.08);
        }
        .pill.cyan {
          border-color: rgba(6, 182, 212, 0.3);
          color: #38bdf8;
          background: rgba(6, 182, 212, 0.08);
        }

        .footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-top: 1px solid #1e293b;
          padding-top: 20px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          color: #64748b;
        }
        .author-info {
          display: flex;
          align-items: center;
          gap: 16px;
        }
      </style>
    </head>
    <body>
      <div class="bg-grid"></div>
      <div class="radar-glow"></div>

      <div class="content">
        <div>
          <div class="header-row">
            <div class="brand-badge">
              <span class="pulse-dot"></span>
              100 kHz Resilient PNT
            </div>
            <span style="color: #475569; font-family: 'JetBrains Mono', monospace; font-size: 13px;">WGS-84 · ITU-R P.368 · USCG M16562.4A</span>
          </div>

          <div class="main-hero">
            <div class="title-col">
              <div class="title-row">
                <h1>SIMULORAN</h1>
                <span class="version-tag">v1.1</span>
              </div>
              <p class="subtitle">
                High-Fidelity Loran-C & eLoran Hyperbolic Navigation Engineering Simulator
              </p>

              <div class="pillars">
                <span class="pill cyan">TDOA Hyperbolic LOPs</span>
                <span class="pill amber">GDOP Covariance Heatmap</span>
                <span class="pill">Brunavs & Millington ASF</span>
                <span class="pill">9th-Pulse LDC Telemetry</span>
                <span class="pill cyan">GNSS Resilient Fusion</span>
              </div>
            </div>

            <div class="tactical-card">
              <div class="card-header">
                <span>CANONICAL 100 kHz PULSE</span>
                <span style="color: #06b6d4;">ECD = 0 μs</span>
              </div>

              <!-- Real Loran pulse formula visual: t^2 * exp(-2t/65) * sin(0.2pi*t) -->
              <svg class="waveform-svg" viewBox="0 0 320 100" fill="none">
                <!-- Grid lines -->
                <line x1="0" y1="50" x2="320" y2="50" stroke="#1e293b" stroke-width="1"/>
                <line x1="80" y1="0" x2="80" y2="100" stroke="#1e293b" stroke-width="1" stroke-dasharray="2,2"/>
                <line x1="160" y1="0" x2="160" y2="100" stroke="#1e293b" stroke-width="1" stroke-dasharray="2,2"/>
                <line x1="240" y1="0" x2="240" y2="100" stroke="#1e293b" stroke-width="1" stroke-dasharray="2,2"/>

                <!-- Carrier wave inside envelope -->
                <path d="M 0 50 Q 20 48 30 35 T 50 65 T 70 20 T 90 85 T 110 10 T 130 92 T 150 25 T 170 80 T 190 35 T 210 68 T 240 42 T 280 54 T 320 50" stroke="#06b6d4" stroke-width="2" fill="none"/>
                <!-- Positive Envelope -->
                <path d="M 0 50 C 40 45, 70 12, 110 8 C 160 5, 220 35, 320 50" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="4,3" fill="none" opacity="0.6"/>
                <!-- Negative Envelope -->
                <path d="M 0 50 C 40 55, 70 88, 110 92 C 160 95, 220 65, 320 50" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="4,3" fill="none" opacity="0.6"/>
                <!-- Standard sampling zero-crossing marker at t = 30 μs -->
                <circle cx="70" cy="50" r="4" fill="#f59e0b"/>
              </svg>

              <div class="card-stats">
                <span>fc: <span class="stat-val">100.0 kHz</span></span>
                <span>Peak: <span class="stat-val">65.0 μs</span></span>
                <span>Standard Zero: <span style="color: #f59e0b; font-weight: 600;">30 μs</span></span>
              </div>
            </div>
          </div>
        </div>

        <div class="footer">
          <div class="author-info">
            <span>Stand-alone Physics & Radio-Navigation Testbed</span>
            <span>·</span>
            <span>https://simuloran.vercel.app</span>
          </div>
          <div>
            <span>MIT Licensed Open Source</span>
          </div>
        </div>
      </div>
    </body>
  </html>
  `;

  await page.setContent(ogHtml);
  // Wait for Google Fonts to load
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'public/og-image.png', type: 'png' });
  console.log('✓ Generated public/og-image.png (1200x630)');

  await browser.close();
}

generateAssets().catch((err) => {
  console.error('Asset generation failed:', err);
  process.exit(1);
});
