export const paperSectionIds = ['concept', 'question', 'method', 'findings', 'limitations', 'discussion'];
export const siteSectionIds = ['profile', 'education', 'experience', 'projects', 'recognition', 'toolkit', 'newsletter'];
export function assertId(id) {
  if (typeof id !== 'string' || !/^[a-z][a-z0-9-]{0,79}$/.test(id)) throw new Error('Invalid content ID');
  return id;
}
function text(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be nonempty text`);
}
function strings(value, name) {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
  value.forEach(v => text(v, name));
}
export function assertUrl(value, { optional = false } = {}) {
  if (optional && value === '') return;
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid URL'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('URLs must use HTTPS without credentials');
}
export function validatePaperSection(section) {
  if (!section || !paperSectionIds.includes(section.id)) throw new Error('Unknown paper section');
  text(section.title, 'section.title');
  strings(section.paragraphs, 'section.paragraphs');
  if (!section.paragraphs.length) throw new Error('Section needs paragraphs');
  if (section.links !== undefined) {
    if (!Array.isArray(section.links)) throw new Error('links must be an array');
    section.links.forEach(link => { text(link.label, 'link.label'); assertUrl(link.url); });
  }
  return section;
}
export function validatePaper(paper) {
  if (!paper || typeof paper !== 'object') throw new Error('Paper must be an object');
  assertId(paper.id);
  if (!['paper', 'thesis'].includes(paper.kind)) throw new Error('Unknown paper kind');
  for (const key of ['title', 'shortTitle', 'venue', 'summary', 'citation']) text(paper[key], key);
  if (!Number.isInteger(paper.year) || paper.year < 1900 || paper.year > 2200) throw new Error('Invalid year');
  for (const key of ['authors', 'tags', 'pipeline', 'discussionPrompts']) strings(paper[key], key);
  if (!paper.authors.length) throw new Error('At least one author is required');
  for (const key of ['sourceUrl', 'pdfUrl', 'codeUrl']) assertUrl(paper[key], { optional: true });
  if (!Array.isArray(paper.sections) || paper.sections.length !== paperSectionIds.length) throw new Error('Six common sections required');
  paper.sections.forEach((section, index) => {
    validatePaperSection(section);
    if (section.id !== paperSectionIds[index]) throw new Error('Paper sections must follow the common order');
  });
  if (!Array.isArray(paper.metrics)) throw new Error('metrics must be an array');
  paper.metrics.forEach(metric => { text(metric.label, 'metric.label'); text(metric.value, 'metric.value'); });
  for (const key of ['sourceNote', 'contribution']) if (paper[key] !== undefined) text(paper[key], key);
  return paper;
}
// Homepage section schemas mirror the actual renderer, so invalid updates fail before publishing.
export function validateSiteSection(section) {
  if (!section || !siteSectionIds.includes(section.id)) throw new Error('Unknown site section');
  const requireTexts = (object, fields) => fields.forEach(key => text(object[key], key));
  const rows = (value, check) => {
    if (!Array.isArray(value)) throw new Error('Expected an array');
    value.forEach(check);
  };
  switch (section.id) {
    case 'profile':
      requireTexts(section, ['name', 'role', 'location', 'email', 'phone', 'intro', 'bio']);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(section.email)) throw new Error('Invalid email');
      if (!/^\+?[\d ()-]+$/.test(section.phone)) throw new Error('Invalid phone');
      for (const key of ['github', 'linkedin', 'anthology', 'newsletter']) assertUrl(section.links?.[key]);
      strings(section.researchInterests, 'researchInterests'); break;
    case 'education':
      requireTexts(section, ['degree', 'institution', 'shortName', 'location', 'period', 'cgpa', 'scholarships', 'teachingStatement']);
      if (!Number.isInteger(section.scholarshipCount) || section.scholarshipCount < 0) throw new Error('Invalid scholarship count');
      strings(section.teaching, 'teaching'); break;
    case 'experience':
      rows(section.positions, p => { requireTexts(p, ['company', 'role', 'period', 'location', 'summary']); strings(p.highlights, 'highlights'); strings(p.technologies, 'technologies'); });
      rows(section.inventions, p => requireTexts(p, ['title', 'description'])); text(section.inventionNote, 'inventionNote'); break;
    case 'projects':
      rows(section.items, p => { requireTexts(p, ['title', 'category', 'description', 'detail']); strings(p.technologies, 'technologies'); }); break;
    case 'recognition':
      requireTexts(section.programming, ['codeforces', 'codechef', 'problems', 'contests']);
      rows(section.awards, p => requireTexts(p, ['result', 'event', 'year']));
      rows(section.references, p => requireTexts(p, ['name', 'role', 'affiliation'])); break;
    case 'toolkit':
      rows(section.groups, p => { text(p.title, 'title'); strings(p.items, 'items'); });
      rows(section.directions, p => requireTexts(p, ['title', 'description'])); break;
    case 'newsletter': requireTexts(section, ['title', 'subtitle', 'description']); assertUrl(section.url); break;
  }
  return section;
}
export function validateConfig(config) {
  assertUrl(config.siteUrl);
  const url = new URL(config.siteUrl);
  if (url.search || url.hash) throw new Error('siteUrl must not contain a query or fragment');
  config.siteUrl = url.href.replace(/\/$/, '');
  if (!/^[\w.-]+\/[\w.-]+$/.test(config.repository)) throw new Error('Invalid GitHub repository');
  text(config.branch, 'branch');
  if (!config.giscus || typeof config.giscus.repoId !== 'string' || typeof config.giscus.categoryId !== 'string') throw new Error('Missing comments configuration');
  if (Boolean(config.giscus.repoId) !== Boolean(config.giscus.categoryId)) throw new Error('Both giscus IDs are required to enable comments');
  text(config.giscus.category, 'category');
  return config;
}
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
