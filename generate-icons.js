import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function generateIcons() {
  try {
    // Read SVG
    const svgPath = path.join(__dirname, 'icon.svg');
    const svgBuffer = fs.readFileSync(svgPath);

    // Generate 192x192
    await sharp(svgBuffer)
      .resize(192, 192, {
        fit: 'cover',
        position: 'center',
      })
      .png()
      .toFile(path.join(__dirname, 'public', 'icon-192x192.png'));
    console.log('✓ Generated icon-192x192.png');

    // Generate 512x512
    await sharp(svgBuffer)
      .resize(512, 512, {
        fit: 'cover',
        position: 'center',
      })
      .png()
      .toFile(path.join(__dirname, 'public', 'icon-512x512.png'));
    console.log('✓ Generated icon-512x512.png');

    // Generate 192x192 maskable version
    await sharp(svgBuffer)
      .resize(192, 192, {
        fit: 'cover',
        position: 'center',
      })
      .png()
      .toFile(path.join(__dirname, 'public', 'icon-192x192-maskable.png'));
    console.log('✓ Generated icon-192x192-maskable.png');

    // Generate 512x512 maskable version
    await sharp(svgBuffer)
      .resize(512, 512, {
        fit: 'cover',
        position: 'center',
      })
      .png()
      .toFile(path.join(__dirname, 'public', 'icon-512x512-maskable.png'));
    console.log('✓ Generated icon-512x512-maskable.png');

    console.log('\n✓ All icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
