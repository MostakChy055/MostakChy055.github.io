import { readFile, writeFile } from 'node:fs/promises';
import { PortfolioAPI } from '../lib/github-api.mjs';
import { assertId, validatePaper, validateSiteSection, paperSectionIds } from '../lib/content.mjs';

const [command, id, file] = process.argv.slice(2);
const root = new URL('../', import.meta.url);
const read = async name => JSON.parse(await readFile(name, 'utf8'));
try {
  if (command === 'template') {
    assertId(id);
    const template = { id, kind: 'paper', title: 'Replace with the full publication title', shortTitle: 'Replace with a readable research-note title', year: new Date().getUTCFullYear(), venue: 'Replace with the publication venue', authors: ['Mostak Mahmud Chowdhury'], tags: ['NLP'], summary: 'Replace with the research summary', sourceUrl: '', pdfUrl: '', codeUrl: '', metrics: [], pipeline: ['Input', 'Method', 'Output'], sections: paperSectionIds.map(sectionId => ({ id: sectionId, title: ({ concept: 'Start with the idea', question: 'The research question', method: 'Approach & techniques', findings: 'Findings & evidence', limitations: 'What remains difficult', discussion: 'Research directions & discussion' })[sectionId], paragraphs: ['Replace with verified content and clearly identified discussion.'] })), discussionPrompts: ['Replace with a question for readers.'], citation: 'Replace with the full citation' };
    await writeFile(new URL(`content/papers/${id}.json`, root), JSON.stringify(template, null, 2) + '\n', { flag: 'wx' });
    console.log(`Created content/papers/${id}.json. Replace the template text before publishing.`);
  } else if (command === 'validate') {
    const { loadContent } = await import('./build.mjs');
    await loadContent();
    console.log('All portfolio content is valid.');
  } else if (['get-paper', 'get-section', 'add-paper', 'update-paper', 'update-section'].includes(command)) {
    const config = await read(new URL('content/config.json', root));
    const api = new PortfolioAPI({ ...config, token: process.env.GITHUB_TOKEN });
    if (command === 'get-paper') console.log(JSON.stringify(await api.getPaper(id), null, 2));
    if (command === 'get-section') console.log(JSON.stringify(await api.getSiteSection(id), null, 2));
    if (command === 'add-paper') {
      const paper = validatePaper(await read(id));
      await api.addPaper(paper); console.log(`Published new content: ${paper.id}`);
    }
    if (command === 'update-paper' || command === 'update-section') {
      // The update file is an envelope previously read from the API: { data, sha }.
      const envelope = await read(id);
      if (command === 'update-paper') await api.updatePaper(validatePaper(envelope.data), envelope.sha);
      else await api.updateSiteSection(validateSiteSection(envelope.data), envelope.sha);
      console.log(`Published content: ${envelope.data.id}`);
    }
  } else throw new Error('Usage: npm run content -- template ID | validate | get-paper ID | get-section ID | add-paper FILE | update-paper ENVELOPE.json | update-section ENVELOPE.json');
} catch (error) { console.error(error.message); process.exitCode = 1; }
