import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');
const canonical = 'https://www.blazebreak.app/';

describe('public SEO signals and private API boundaries', () => {
  it('publishes a robots declaration and links the same canonical sitemap', () => {
    const robots = read('public/robots.txt');
    expect(robots).toContain('User-agent: *');
    expect(robots).toContain('Disallow: /api/');
    expect(robots).toContain('Sitemap: ' + canonical + 'sitemap.xml');
  });

  it('includes only public homepage URLs in the sitemap', () => {
    const sitemap = read('public/sitemap.xml');
    expect(sitemap).toContain('<loc>' + canonical + '</loc>');
    expect(sitemap).not.toMatch(/\/api\/|\/(?:admin|account|dashboard|settings)\b/);
    expect((sitemap.match(/<url>/g) || [])).toHaveLength(1);
  });

  it('matches the public landing canonical and social URL', () => {
    const index = read('index.html');
    expect(index).toContain('<link rel="canonical" href="' + canonical + '"');
    expect(index).toContain('<meta property="og:url" content="' + canonical + '"');
  });
});
