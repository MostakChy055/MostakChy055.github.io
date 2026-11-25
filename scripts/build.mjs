import { mkdir, readFile, readdir, writeFile, cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validatePaper, validateSiteSection, validateConfig, siteSectionIds } from '../lib/content.mjs';
import { home, researchPage, layout } from '../lib/render.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));
export async function loadContent() {
  const config = validateConfig(await read('content/config.json'));
  const sections = Object.fromEntries(await Promise.all(siteSectionIds.map(async id => {
    const section = validateSiteSection(await read(`content/sections/${id}.json`));
    if (section.id !== id) throw new Error(`Section ID does not match filename: ${id}`);
    return [id, section];
  })));
  const files = (await readdir(path.join(root, 'content/papers'))).filter(file => file.endsWith('.json'));
  const papers = await Promise.all(files.map(async file => {
    const paper = validatePaper(await read(`content/papers/${file}`));
    if (file !== `${paper.id}.json`) throw new Error(`Paper ID does not match filename: ${file}`);
    return paper;
  }));
  if (papers.filter(p => p.kind === 'thesis').length !== 1) throw new Error('Exactly one featured thesis required');
  papers.sort((a, b) => b.year - a.year || a.id.localeCompare(b.id));
  return { config, sections, papers };
}

export async function build() {
  // Validate all content before replacing the previous output.
  const { config, sections, papers } = await loadContent();
  const dist = path.join(root, 'dist');
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  const write = async (file, data) => {
    const target = path.join(dist, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
  };
  const json = (file, data) => write(file, JSON.stringify(data, null, 2) + '\n');
  await cp(path.join(root, 'public'), dist, { recursive: true });
  await cp(path.join(root, 'MostakMahmudAcademicCV.pdf'), path.join(dist, 'MostakMahmudAcademicCV.pdf'));
  await write('.nojekyll', '');
  await write('index.html', home(sections, papers, config));
  const base = config.siteUrl.replace(/\/$/, '');
  await write('404.html', layout({ title: 'Page not found — Mostak Chowdhury', description: 'Return to the research portfolio.', body: `<main class="wrap section" id="main"><p class="eyebrow">404</p><h1>This page has moved<br>or does not exist.</h1><p><a class="button primary" href="${base}/">Return to the portfolio</a></p></main>`, root: `${base}/`, config, profile: sections.profile }));
  for (const paper of papers) {
    await write(`research/${paper.id}/index.html`, researchPage(paper, sections.profile, config));
    await json(`api/v1/papers/${paper.id}.json`, paper);
    for (const section of paper.sections) await json(`api/v1/papers/${paper.id}/sections/${section.id}.json`, section);
    await json(`api/v1/papers/${paper.id}/discussion.json`, { paperId: paper.id, term: `research/${paper.id}`, prompts: paper.discussionPrompts, provider: 'github-discussions', enabled: Boolean(config.giscus.repoId && config.giscus.categoryId), repository: config.repository, note: 'Prompts are editorial content. Live comments are stored in GitHub Discussions and accessed through its GraphQL API, not this static endpoint.' });
  }
  for (const [id, section] of Object.entries(sections)) await json(`api/v1/sections/${id}.json`, section);
  await json('api/v1/papers.json', papers);
  await json('api/v1/sections.json', sections);
  await json('api/v1/index.json', { version: 1, papers: './papers.json', sections: './sections.json', paper: './papers/{id}.json', paperSection: './papers/{id}/sections/{sectionId}.json', discussion: './papers/{id}/discussion.json', writeApi: 'GitHub Contents REST API; see README.md and lib/github-api.mjs', commentApi: 'GitHub Discussions GraphQL API', repository: config.repository });
  await write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
  await write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['', ...papers.map(p => `research/${p.id}/`)].map(route => `<url><loc>${base}/${route}</loc></url>`).join('')}</urlset>`);
  console.log(`Built ${papers.length + 2} pages and structured JSON endpoints in dist/`);
  return { dist, papers, sections, config };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await build();
