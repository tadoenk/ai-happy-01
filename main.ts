import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_FILE_SIZE = 1048576; // 1 MiB

function computeFileStats(filePath: string): { size: number; hash: string } {
  const buffer = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  return { size: buffer.length, hash };
}

function verifyJpegGuardrails(filePath: string) {
  let stats: fs.Stats;
  try {
    stats = fs.statSync(filePath);
  } catch (err) {
    console.error(`Error: Failed to get file stats for ${filePath}:`, err);
    process.exit(1);
  }

  if (stats.size > MAX_FILE_SIZE) {
    console.error(`Error: Source file size (${stats.size} bytes) exceeds the maximum allowed limit of ${MAX_FILE_SIZE} bytes.`);
    process.exit(1);
  }

  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(3);
  try {
    fs.readSync(fd, buffer, 0, 3, 0);
  } finally {
    fs.closeSync(fd);
  }

  // JPEG magic bytes: FF D8 FF
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
    console.error(`Error: Source file ${filePath} is not a valid JPEG (invalid magic bytes: 0x${buffer.toString('hex')}).`);
    process.exit(1);
  }
}

function main() {
  const rawOutputDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';
  const outputDir = path.isAbsolute(rawOutputDir) ? rawOutputDir : path.resolve(process.cwd(), rawOutputDir);
  const sourcePath = path.join(__dirname, 'entry.png');
  const destPath = path.join(outputDir, 'entry.png');

  if (!fs.existsSync(sourcePath)) {
    console.error(`Error: Source file not found at ${sourcePath}`);
    process.exit(1);
  }

  // Run guardrails before copy
  verifyJpegGuardrails(sourcePath);

  try {
    fs.mkdirSync(outputDir, { recursive: true });
  } catch (err) {
    console.error(`Error: Failed to create output directory ${outputDir}:`, err);
    process.exit(1);
  }

  try {
    fs.copyFileSync(sourcePath, destPath);
  } catch (err) {
    console.error(`Error: Failed to copy file to ${destPath}:`, err);
    process.exit(1);
  }

  if (!fs.existsSync(destPath)) {
    console.error(`Error: Destination file not found after copy at ${destPath}`);
    process.exit(1);
  }

  let sourceStats: { size: number; hash: string };
  let destStats: { size: number; hash: string };

  try {
    sourceStats = computeFileStats(sourcePath);
  } catch (err) {
    console.error(`Error: Failed to read source file ${sourcePath}:`, err);
    process.exit(1);
  }

  try {
    destStats = computeFileStats(destPath);
  } catch (err) {
    console.error(`Error: Failed to read destination file ${destPath}:`, err);
    process.exit(1);
  }

  console.log(`Source Path:     ${sourcePath}`);
  console.log(`Source Size:     ${sourceStats.size} bytes`);
  console.log(`Source SHA-256:  ${sourceStats.hash}`);
  console.log('----------------------------------------');
  console.log(`Dest Path:       ${destPath}`);
  console.log(`Dest Size:       ${destStats.size} bytes`);
  console.log(`Dest SHA-256:    ${destStats.hash}`);

  if (sourceStats.size !== destStats.size || sourceStats.hash !== destStats.hash) {
    console.error('Error: Verification failed! Source and destination sizes or SHA-256 hashes do not match.');
    process.exit(1);
  }

  console.log('Verification successful: Source and destination files are identical.');
}

main();
