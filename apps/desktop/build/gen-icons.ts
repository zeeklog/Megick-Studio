/**
 * Generate placeholder icons for Electron build.
 * Replace with actual Megick branding artwork before release.
 *
 * Requires: pnpm --filter @megick/desktop add -D sharp
 * Usage: tsx build/gen-icons.ts
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BUILD_DIR = resolve(__dirname);

// Creates a simple SVG icon with the Megick "M" mark
function generateSVG(size: number): string {
  const half = size / 2;
  const strokeW = size * 0.06;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="${size}" y2="${size}">
      <stop offset="0%" stop-color="#a855f7"/>
      <stop offset="100%" stop-color="#6366f1"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="#0a0a0a"/>
  <text x="${half}" y="${half}" text-anchor="middle" dominant-baseline="central"
    font-family="Inter, sans-serif" font-weight="800" font-size="${size * 0.5}"
    fill="url(#g)">M</text>
  <rect x="${strokeW / 2}" y="${strokeW / 2}" width="${size - strokeW}" height="${size - strokeW}"
    rx="${size * 0.2}" fill="none" stroke="url(#g)" stroke-width="${strokeW}"/>
</svg>`;
}

async function generateIcons() {
  try {
    require.resolve("sharp");
  } catch {
    console.warn("⚠  sharp not installed. Install with: pnpm --filter @megick/desktop add -D sharp");
    console.warn("   Skipping PNG icon generation. Place custom icons in build/ manually.");
    return;
  }

  const sharp = (await import("sharp")).default;
  const sizes: Array<{ name: string; size: number }> = [
    { name: "icon.png", size: 1024 },
  ];

  for (const { name, size } of sizes) {
    const svg = generateSVG(size);
    const pngPath = resolve(BUILD_DIR, name);
    await sharp(Buffer.from(svg)).resize(size, size).png().toFile(pngPath);
    console.log(`  ✓ ${name} (${size}x${size})`);
  }

  // Also create a macOS .icns from the PNG (requires iconutil or png2icons)
  const icnsPath = resolve(BUILD_DIR, "icon.icns");
  const png1024 = resolve(BUILD_DIR, "icon.png");

  if (!existsSync(icnsPath) && existsSync(png1024)) {
    try {
      // macOS: use sips + iconutil
      const iconset = resolve(BUILD_DIR, "icon.iconset");
      mkdirSync(iconset, { recursive: true });

      const iconSizes = [16, 32, 64, 128, 256, 512];
      for (const s of iconSizes) {
        const double = s * 2;
        execSync(
          `sips -z ${s} ${s} ${png1024} --out ${iconset}/icon_${s}x${s}.png 2>/dev/null`,
        );
        execSync(
          `sips -z ${double} ${double} ${png1024} --out ${iconset}/icon_${s}x${s}@2x.png 2>/dev/null`,
        );
      }
      execSync(`iconutil -c icns ${iconset} -o ${icnsPath} 2>/dev/null`);
      console.log("  ✓ icon.icns");
    } catch {
      console.warn("  ⚠ Could not generate .icns (macOS only). Run on macOS or install custom icon.");
    }
  }

  console.log("\nPlaceholder icons generated. Replace build/icon.png and build/icon.icns with real artwork.");
}

generateIcons().catch(console.error);
