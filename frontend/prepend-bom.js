import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.join(__dirname, 'build/assets');

if (fs.existsSync(assetsDir)) {
  const files = fs.readdirSync(assetsDir);
  for (const file of files) {
    if (file.endsWith('.js')) {
      const filePath = path.join(assetsDir, file);
      const content = fs.readFileSync(filePath);
      // Check if it already has UTF-8 BOM
      if (content[0] !== 0xef || content[1] !== 0xbb || content[2] !== 0xbf) {
        const bom = Buffer.from([0xef, 0xbb, 0xbf]);
        fs.writeFileSync(filePath, Buffer.concat([bom, content]));
        console.log(`Prepended UTF-8 BOM to ${file}`);
      }
    }
  }
}
