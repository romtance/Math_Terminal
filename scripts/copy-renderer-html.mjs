import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const source = join(process.cwd(), 'dist', 'index.html');
const target = join(process.cwd(), 'dist', 'renderer', 'index.html');

await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
