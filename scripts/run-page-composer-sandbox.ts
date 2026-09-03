import {
  MAX_PAGE_COMPOSER_INPUT_BYTES,
  composeApprovedStrategyPage,
} from '../lib/page-composer';

async function main() {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_PAGE_COMPOSER_INPUT_BYTES)
      throw new Error('Input exceeds its size limit.');
    chunks.push(buffer);
  }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  process.stdout.write(JSON.stringify(composeApprovedStrategyPage(value)));
}

void main().catch(() => {
  console.error('Page composer sandbox rejected its input.');
  process.exitCode = 1;
});
