import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { build, loadContent } from '../scripts/build.mjs';
import { assertId, assertUrl, validatePaper, validateConfig, validateSiteSection, escapeHtml } from '../lib/content.mjs';
import { researchPage } from '../lib/render.mjs';

test('all content validates and includes the four papers and featured thesis', async () => {
  const { papers, sections } = await loadContent();
  assert.equal(papers.filter(p => p.kind === 'thesis').length, 1);
  assert.ok(papers.filter(p => p.kind === 'paper').length >= 4);
  assert.equal(Object.keys(sections).length, 7);
  assert.match(sections.education.scholarships, /Eight consecutive/);
});
test('content validation rejects traversal, unsafe URLs, and incomplete research', async () => {
  for (const value of ['../config', 'x/y', '<script>', '', 'UpperCase']) assert.throws(() => assertId(value));
  for (const value of ['javascript:alert(1)', '//example.com', 'https://user:secret@example.com']) assert.throws(() => assertUrl(value));
  const { papers, config, sections } = await loadContent();
  assert.throws(() => validatePaper({ ...papers[0], sections: [] }));
  assert.throws(() => validatePaper({ ...papers[0], year: '2025' }));
  assert.throws(() => validateSiteSection({ ...sections.profile, links: {} }));
  assert.throws(() => validateConfig({ ...config, giscus: { ...config.giscus, repoId: 'one-id-only' } }));
});
test('renderer escapes author-controlled content and enables comments only when configured', async () => {
  const { papers, config, sections } = await loadContent();
  const paper = structuredClone(papers[0]);
  paper.shortTitle = '<img src=x onerror=alert(1)>';
  const html = researchPage(paper, sections.profile, config);
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('id="load-comments"'));
  assert.match(html, /conversation opens soon/);
  const connected = researchPage(paper, sections.profile, { ...config, giscus: { repoId: 'R_test', categoryId: 'DIC_test', category: 'Research' } });
  assert.ok(connected.includes(`data-term="research/${paper.id}"`));
  assert.ok(connected.includes('id="load-comments"'));
  assert.equal(escapeHtml('"<&'), '&quot;&lt;&amp;');
});
test('build generates readable pages, API endpoints, and valid internal links/anchors', async () => {
  const { dist, papers, sections } = await build();
  const pages = ['index.html', ...papers.map(p => `research/${p.id}/index.html`)];
  for (const page of pages) {
    const html = await readFile(path.join(dist, page), 'utf8');
    assert.match(html, /<main/);
    assert.match(html, /<h1/);
    for (const match of html.matchAll(/(?:href|src)="([^\"]+)"/g)) {
      const href = match[1].replaceAll('&amp;', '&');
      if (/^(https?:|mailto:|tel:)/.test(href)) continue;
      const url = new URL(href, `https://preview.local/${page}`);
      let target = path.join(dist, decodeURIComponent(url.pathname));
      if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html');
      await stat(target);
      if (url.hash) {
        const targetHtml = await readFile(target, 'utf8');
        assert.ok(targetHtml.includes(`id="${url.hash.slice(1)}"`), `Missing anchor ${href} from ${page}`);
      }
    }
  }
  const endpoint = JSON.parse(await readFile(path.join(dist, 'api/v1/papers.json'), 'utf8'));
  assert.equal(endpoint.length, papers.length);
  for (const paper of papers) {
    for (const section of paper.sections) {
      const data = JSON.parse(await readFile(path.join(dist, `api/v1/papers/${paper.id}/sections/${section.id}.json`), 'utf8'));
      assert.deepEqual(data, section);
    }
  }
  for (const id of Object.keys(sections)) {
    assert.deepEqual(JSON.parse(await readFile(path.join(dist, `api/v1/sections/${id}.json`), 'utf8')), sections[id]);
  }
  const files = await readdir(dist);
  assert.ok(files.includes('MostakMahmudAcademicCV.pdf'));
  assert.ok(!files.includes('lib'));
  assert.ok(!files.includes('.env'));
});
