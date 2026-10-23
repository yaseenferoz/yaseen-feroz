import { readFile, writeFile } from 'node:fs/promises';

const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const main = source.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];

if (!main) throw new Error('Could not find the portfolio main element in index.html.');

function decodeEntities(text) {
  const named = {
    amp: '&',
    apos: "'",
    eacute: 'é',
    gt: '>',
    lt: '<',
    nbsp: ' ',
    ndash: '–',
    quot: '"',
    rsquo: '’'
  };

  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, value) => {
    if (value[0] === '#') {
      const codePoint = value[1].toLowerCase() === 'x'
        ? Number.parseInt(value.slice(2), 16)
        : Number.parseInt(value.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }
    return named[value.toLowerCase()] ?? entity;
  });
}

const text = main
  .replace(/<form\b[^>]*class=["'][^"']*\bcontact-form\b[^"']*["'][^>]*>[\s\S]*?<\/form>/gi, ' ')
  .replace(/<(script|style|svg|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<img\b[^>]*>/gi, ' ')
  .replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_match, attributes, inner) => {
    const href = attributes.match(/\bhref=["']([^"']+)["']/i)?.[1] || '';
    const label = inner.replace(/<[^>]*>/g, ' ');
    const publicLink = /^(https?:|mailto:|tel:)/i.test(href) ? ` (${href})` : '';
    return `${label}${publicLink}`;
  })
  .replace(/<br\s*\/?\s*>/gi, '\n')
  .replace(/<\/(?:h[1-6]|p|li|article|section|details|summary|blockquote|footer|header|main|div)>/gi, '\n')
  .replace(/<[^>]*>/g, ' ');

const lines = decodeEntities(text)
  .split(/\r?\n/)
  .map(line => line.replace(/\s+/g, ' ').trim())
  .filter(Boolean);

const context = lines.join('\n');
if (context.length < 1000) throw new Error('The extracted portfolio context looks incomplete.');

await writeFile(new URL('../api/portfolio-context.txt', import.meta.url), `${context}\n`, 'utf8');
console.log(`Prepared ${lines.length} portfolio lines (${context.length} characters) for the chat backend.`);
