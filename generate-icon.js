// Generate PNG icon from SVG using Electron's nativeImage
// Run: node generate-icon.js

const fs = require('fs');
const path = require('path');

// We'll create a simple 256x256 PNG icon programmatically
// Using a canvas-like approach with raw pixel data for ICO

// First, let's create the icon using sharp or just use the SVG directly
// electron-builder can work with PNG, so let's create a high-quality PNG

// Simple approach: create a script that uses Electron to render SVG to PNG
const script = `
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
    const win = new BrowserWindow({
        width: 512, height: 512,
        show: false,
        webPreferences: { offscreen: true }
    });

    const svgPath = path.join(__dirname, 'assets', 'icon.svg');
    const svgContent = fs.readFileSync(svgPath, 'utf-8');
    const html = \`<html><body style="margin:0;padding:0;background:transparent;"><img src="data:image/svg+xml;base64,\${Buffer.from(svgContent).toString('base64')}" width="512" height="512"></body></html>\`;

    await win.loadURL('data:text/html;base64,' + Buffer.from(html).toString('base64'));

    // Wait for render
    await new Promise(r => setTimeout(r, 1000));

    const image = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
    const pngBuffer = image.toPNG();

    fs.writeFileSync(path.join(__dirname, 'assets', 'icon.png'), pngBuffer);
    console.log('icon.png created (512x512)');

    // Create multiple sizes for ICO
    for (const size of [16, 32, 48, 64, 128, 256]) {
        const resized = image.resize({ width: size, height: size });
        fs.writeFileSync(path.join(__dirname, 'assets', \`icon-\${size}.png\`), resized.toPNG());
    }
    console.log('All icon sizes created');

    app.quit();
});
`;

fs.writeFileSync(path.join(__dirname, 'generate-icon-electron.js'), script);
console.log('Run: npx electron generate-icon-electron.js');
