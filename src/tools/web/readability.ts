import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import type { ExtractMode } from './types.js';

export type ExtractOptions = {
  extractMode: ExtractMode;
  maxChars: number;
};

export type ExtractResult = {
  title?: string;
  content: string;
  truncated: boolean;
};

const REMOVE_SELECTORS = [
  'script',
  'style',
  'noscript',
  'iframe',
  'svg',
  'canvas',
  'nav',
  'footer',
  'aside',
  'header',
  'form',
  'input',
  'button',
  'figure',
  'figcaption',
  '.advertisement',
  '.ads',
  '.ad',
  '.banner',
  '.cookie',
  '.newsletter',
  '.subscribe',
];

function cleanContent(markdown: string): string {
  return markdown
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncateContent(content: string, maxChars: number): { content: string; truncated: boolean } {
  if (content.length <= maxChars) return { content, truncated: false };
  return { content: content.slice(0, maxChars), truncated: true };
}

export function extractReadableContent(html: string, options: ExtractOptions): ExtractResult {
  const $ = cheerio.load(html);
  $(REMOVE_SELECTORS.join(',')).remove();

  const title = ($('title').first().text() || $('h1').first().text()).trim() || undefined;

  const root = $('article').first();
  const container = root.length ? root : $('main').first().length ? $('main').first() : $('body');

  let content = '';
  if (options.extractMode === 'text') {
    content = container.text();
  } else {
    const turndown = new TurndownService({
      codeBlockStyle: 'fenced',
      headingStyle: 'atx',
      bulletListMarker: '-',
    });
    const htmlFragment = container.html() || '';
    content = turndown.turndown(htmlFragment);
  }

  content = cleanContent(content);
  const truncatedResult = truncateContent(content, options.maxChars);

  return {
    title,
    content: truncatedResult.content,
    truncated: truncatedResult.truncated,
  };
}
