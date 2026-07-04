const fs = require('fs');
const path = require('path');

// Target directory
const distDir = path.join(__dirname, 'public');

console.log('Building Ruqyah Audio App...');

// Create/clean target directory
if (fs.existsSync(distDir)) {
    console.log('Cleaning existing public folder...');
    fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

// Files to copy
const filesToCopy = [
    'index.html',
    'app.js',
    'audio.json',
    'pdf_list.json',
    'manifest.json',
    'service-worker.js',
    'firebase-config.js'
];

filesToCopy.forEach(file => {
    const src = path.join(__dirname, file);
    const dest = path.join(distDir, file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log(`Copied ${file} to public/`);
    } else {
        console.warn(`Warning: ${file} not found in root.`);
    }
});

// Directory to copy recursively
function copyDirSync(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (let entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

const pdfSrc = path.join(__dirname, 'pdf');
const pdfDest = path.join(distDir, 'pdf');
if (fs.existsSync(pdfSrc)) {
    console.log('Copying pdf directory recursively to public/pdf...');
    copyDirSync(pdfSrc, pdfDest);
} else {
    console.warn('Warning: pdf directory not found in root.');
}

console.log('✅ Build completed successfully!');
