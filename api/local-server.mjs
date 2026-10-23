import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

const PORT = Number(process.env.PORT || 8787);
const ORIGIN = process.env.ALLOWED_ORIGIN || `http://localhost:${PORT}`;
process.env.ALLOWED_ORIGIN = ORIGIN;
const handlers = {
  '/api/chat': (await import('./chat.mjs')).handler,
  '/api/contact': (await import('./chat.mjs')).handler
};

createServer(async (request, response) => {
  const handler = handlers[request.url];
  if (!handler) {
    response.writeHead(404).end('Not found');
    return;
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const event = {
    httpMethod: request.method,
    rawPath: request.url,
    headers: request.headers,
    body: Buffer.concat(chunks).toString('utf8'),
    requestContext: { http: { method: request.method, path: request.url, sourceIp: request.socket.remoteAddress } }
  };
  const result = await handler(event);
  response.writeHead(result.statusCode, result.headers).end(result.body);
}).listen(PORT, () => {
  console.log(`Local chat endpoint: http://localhost:${PORT}/api/chat`);
  console.log('The portfolio page automatically uses this endpoint on localhost; set ALLOWED_ORIGIN to match your local preview origin.');
});

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  process.on('SIGINT', () => process.exit(0));
}
