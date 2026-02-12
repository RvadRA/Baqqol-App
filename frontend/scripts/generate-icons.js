import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Icon sizes for PWA
const sizes = [72, 96, 128, 144, 152, 167, 180, 192, 384, 512];
const inputFile = path.join(__dirname, '../public/favicon.svg');
const outputDir = path.join(__dirname, '../public/icons');

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
  console.log('📁 Created icons directory');
}

// Check if favicon.svg exists
if (!fs.existsSync(inputFile)) {
  console.error('❌ favicon.svg not found at:', inputFile);
  process.exit(1);
}

console.log('🎨 Generating PWA icons from favicon.svg...\n');

// Generate main icons
async function generateIcons() {
  const promises = sizes.map(async (size) => {
    try {
      // Generate standard icon
      await sharp(inputFile)
        .resize(size, size)
        .png()
        .toFile(path.join(outputDir, `icon-${size}x${size}.png`));
      
      console.log(`✅ Generated ${size}x${size} icon`);
      
      // Generate maskable icon (with padding for safe zone)
      await sharp(inputFile)
        .resize(Math.floor(size * 0.8), Math.floor(size * 0.8)) // 80% size for padding
        .extend({
          top: Math.floor(size * 0.1),
          bottom: Math.floor(size * 0.1),
          left: Math.floor(size * 0.1),
          right: Math.floor(size * 0.1),
          background: { r: 79, g: 70, b: 229, alpha: 1 } // #4f46e5 - indigo-600
        })
        .resize(size, size)
        .png()
        .toFile(path.join(outputDir, `maskable-icon-${size}x${size}.png`));
      
      console.log(`✅ Generated maskable ${size}x${size} icon`);
    } catch (error) {
      console.error(`❌ Error generating ${size}x${size} icon:`, error.message);
    }
  });

  await Promise.all(promises);
}

// Generate shortcut icons
async function generateShortcutIcons() {
  const shortcutSizes = [192];
  const shortcuts = [
    { 
      name: 'debt', 
      bg: '#8b5cf6', // purple-500
      text: '+',
      description: 'New Debt'
    },
    { 
      name: 'customers', 
      bg: '#3b82f6', // blue-500
      text: 'C',
      description: 'Customers'
    },
    { 
      name: 'chats', 
      bg: '#10b981', // emerald-500
      text: '💬',
      description: 'Chats'
    }
  ];

  for (const shortcut of shortcuts) {
    for (const size of shortcutSizes) {
      try {
        // Create SVG for shortcut
        const svgContent = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
          <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="${shortcut.bg}"/>
          <text x="50%" y="65%" text-anchor="middle" font-family="Arial, sans-serif" font-size="${size * 0.5}" fill="white" dy=".1em">${shortcut.text}</text>
        </svg>`;
        
        const tempFile = path.join(outputDir, `temp-${shortcut.name}.svg`);
        fs.writeFileSync(tempFile, svgContent);
        
        await sharp(tempFile)
          .png()
          .toFile(path.join(outputDir, `shortcut-${shortcut.name}-${size}x${size}.png`));
        
        fs.unlinkSync(tempFile);
        console.log(`✅ Generated shortcut-${shortcut.name} ${size}x${size} icon`);
      } catch (error) {
        console.error(`❌ Error generating shortcut-${shortcut.name} icon:`, error.message);
      }
    }
  }
}

// Generate Apple touch icons
async function generateAppleIcons() {
  const appleSizes = [152, 167, 180];
  
  for (const size of appleSizes) {
    try {
      await sharp(inputFile)
        .resize(size, size)
        .png()
        .toFile(path.join(__dirname, `../public/apple-touch-icon-${size}x${size}.png`));
      
      console.log(`✅ Generated apple-touch-icon ${size}x${size}`);
    } catch (error) {
      console.error(`❌ Error generating apple-touch-icon ${size}x${size}:`, error.message);
    }
  }
  
  // Generate default apple-touch-icon (180x180)
  try {
    await sharp(inputFile)
      .resize(180, 180)
      .png()
      .toFile(path.join(__dirname, '../public/apple-touch-icon.png'));
    
    console.log('✅ Generated default apple-touch-icon (180x180)');
  } catch (error) {
    console.error('❌ Error generating default apple-touch-icon:', error.message);
  }
}

// Generate favicon.ico (for older browsers)
async function generateFaviconIco() {
  try {
    // Generate 32x32 PNG first
    const png32 = await sharp(inputFile)
      .resize(32, 32)
      .png()
      .toBuffer();
    
    // Save as favicon.ico
    fs.writeFileSync(path.join(__dirname, '../public/favicon.ico'), png32);
    console.log('✅ Generated favicon.ico (32x32)');
  } catch (error) {
    console.error('❌ Error generating favicon.ico:', error.message);
  }
}

// Generate splash screens (for iOS)
async function generateSplashScreens() {
  const splashSizes = [
    { width: 2048, height: 2732, name: 'apple-splash-2048-2732' }, // iPad Pro 12.9"
    { width: 1668, height: 2388, name: 'apple-splash-1668-2388' }, // iPad Pro 11"
    { width: 1536, height: 2048, name: 'apple-splash-1536-2048' }, // iPad Mini, Air
    { width: 1125, height: 2436, name: 'apple-splash-1125-2436' }, // iPhone X, XS
    { width: 1242, height: 2688, name: 'apple-splash-1242-2688' }, // iPhone XS Max
    { width: 828, height: 1792, name: 'apple-splash-828-1792' }, // iPhone XR
    { width: 750, height: 1334, name: 'apple-splash-750-1334' }, // iPhone 8, 7, 6s
    { width: 1242, height: 2208, name: 'apple-splash-1242-2208' }, // iPhone 8 Plus, 7 Plus, 6s Plus
    { width: 640, height: 1136, name: 'apple-splash-640-1136' } // iPhone SE, 5s
  ];
  
  const splashDir = path.join(__dirname, '../public/splash-screens');
  
  if (!fs.existsSync(splashDir)) {
    fs.mkdirSync(splashDir, { recursive: true });
  }
  
  for (const size of splashSizes) {
    try {
      // Create a gradient background
      const svgBackground = `<svg width="${size.width}" height="${size.height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#4f46e5;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#8b5cf6;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="${size.width}" height="${size.height}" fill="url(#grad)"/>
        <rect x="${size.width * 0.35}" y="${size.height * 0.35}" width="${size.width * 0.3}" height="${size.height * 0.3}" rx="${size.width * 0.06}" fill="white" opacity="0.1"/>
        <text x="50%" y="50%" font-size="${size.height * 0.15}" font-family="Arial, sans-serif" fill="white" text-anchor="middle" dy=".1em" font-weight="bold">B</text>
        <text x="50%" y="${size.height * 0.6}" font-size="${size.height * 0.05}" font-family="Arial, sans-serif" fill="white" text-anchor="middle" opacity="0.8">BaqqolApp</text>
      </svg>`;
      
      const tempFile = path.join(splashDir, `temp-${size.name}.svg`);
      fs.writeFileSync(tempFile, svgBackground);
      
      await sharp(tempFile)
        .png()
        .toFile(path.join(splashDir, `${size.name}.png`));
      
      fs.unlinkSync(tempFile);
      console.log(`✅ Generated splash screen ${size.width}x${size.height}`);
    } catch (error) {
      console.error(`❌ Error generating splash screen ${size.width}x${size.height}:`, error.message);
    }
  }
}

// Run all generation functions
async function generateAll() {
  console.log('🚀 Starting PWA icon generation...\n');
  
  await generateIcons();
  console.log('\n📱 Generating shortcut icons...');
  await generateShortcutIcons();
  console.log('\n🍎 Generating Apple touch icons...');
  await generateAppleIcons();
  console.log('\n🖥️ Generating favicon.ico...');
  await generateFaviconIco();
  console.log('\n🌊 Generating splash screens...');
  await generateSplashScreens();
  
  console.log('\n✨ All PWA assets generated successfully!');
  
  // Summary
  console.log('\n📊 Summary:');
  console.log(`- Main icons: ${sizes.length} sizes (with maskable variants)`);
  console.log(`- Shortcut icons: 3 types`);
  console.log(`- Apple touch icons: 4 variants`);
  console.log(`- Splash screens: 9 sizes`);
  console.log(`- Output directory: /public/icons`);
  console.log(`- Splash directory: /public/splash-screens`);
}

generateAll().catch(console.error);