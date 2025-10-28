/**
 * 同步共享代码脚本
 * 将backend-js/shared目录复制到frontend/shared
 * 
 * 使用方法：
 * node scripts/sync-shared.js
 */

const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '..', 'backend-js', 'shared');
const targetDir = path.join(__dirname, '..', 'frontend', 'shared');

function copyRecursiveSync(src, dest) {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();

    if (isDirectory) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        fs.readdirSync(src).forEach(childItemName => {
            copyRecursiveSync(
                path.join(src, childItemName),
                path.join(dest, childItemName)
            );
        });
    } else {
        fs.copyFileSync(src, dest);
        console.log(`✓ Copied: ${path.relative(process.cwd(), dest)}`);
    }
}

console.log('🔄 Syncing shared code from backend-js to frontend...');
copyRecursiveSync(sourceDir, targetDir);
console.log('✅ Sync completed!');
