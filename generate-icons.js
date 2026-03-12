const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, 'assets', 'icon-original.png');
const assetsDir = path.join(__dirname, 'assets');

function createIco(pngBuffers, sizes) {
    const numImages = pngBuffers.length;
    const headerSize = 6;
    const dirEntrySize = 16;
    const dirSize = dirEntrySize * numImages;

    let offset = headerSize + dirSize;
    const entries = [];
    for (const buf of pngBuffers) {
        entries.push({ size: buf.length, offset });
        offset += buf.length;
    }

    const totalSize = offset;
    const ico = Buffer.alloc(totalSize);

    ico.writeUInt16LE(0, 0);
    ico.writeUInt16LE(1, 2);
    ico.writeUInt16LE(numImages, 4);

    for (let i = 0; i < numImages; i++) {
        const dirOffset = headerSize + i * dirEntrySize;
        const s = sizes[i];
        ico.writeUInt8(s >= 256 ? 0 : s, dirOffset);
        ico.writeUInt8(s >= 256 ? 0 : s, dirOffset + 1);
        ico.writeUInt8(0, dirOffset + 2);
        ico.writeUInt8(0, dirOffset + 3);
        ico.writeUInt16LE(1, dirOffset + 4);
        ico.writeUInt16LE(32, dirOffset + 6);
        ico.writeUInt32LE(entries[i].size, dirOffset + 8);
        ico.writeUInt32LE(entries[i].offset, dirOffset + 12);
        pngBuffers[i].copy(ico, entries[i].offset);
    }

    return ico;
}

async function generate() {
    // Resize to 512x512 PNG
    await sharp(srcPath)
        .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(path.join(assetsDir, 'icon.png'));
    console.log('icon.png (512x512)');

    // Generate ICO with multiple sizes
    const sizes = [256, 128, 64, 48, 32, 16];
    const pngBuffers = [];
    for (const s of sizes) {
        const buf = await sharp(srcPath)
            .resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toBuffer();
        pngBuffers.push(buf);
    }

    const icoBuf = createIco(pngBuffers, sizes);
    fs.writeFileSync(path.join(assetsDir, 'icon.ico'), icoBuf);
    console.log('icon.ico (multi-size)');

    console.log('Done!');
}

generate().catch(console.error);
