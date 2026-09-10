import { POST } from './app/api/decide/route';
async function main() {
  const request = new Request('http://localhost:3000/api/decide', {
    method: 'POST',
    headers: { 'origin': 'http://localhost:3000', 'x-forwarded-host': 'localhost:3000', 'x-forwarded-proto': 'http' },
  });
  const started = Date.now();
  const response = await POST(request);
  console.log('HTTP', response.status, response.headers.get('content-type'));
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut;
    while ((cut = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, cut); buffer = buffer.slice(cut + 1);
      if (!line.trim()) continue;
      const chunk = JSON.parse(line);
      console.log(`[+${((Date.now() - started) / 1000).toFixed(1)}s] stage ${chunk.stage} ${chunk.name} by ${chunk.by} elapsedMs ${chunk.elapsedMs} bytes ${line.length}`);
      require('fs').appendFileSync('/tmp/stream.ndjson', line + '\n');
    }
  }
  console.log('stream closed at', ((Date.now() - started) / 1000).toFixed(1) + 's');
}
main().catch(e => { console.error('FAILED', e.message); process.exit(1); });
