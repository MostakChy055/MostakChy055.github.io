# Mostak Mahmud Chowdhury — academic portfolio

A research-first portfolio built for **GitHub Pages**, with a featured thesis, four paper discussions, Samsung experience, teaching interests, education, recognition, projects, newsletter, technical skills, references, and the supplied academic CV. The design uses locally available fonts and a small original SVG concept illustration. No runtime framework or build dependencies are required.

## Run locally

Requires Node.js 22 or later.

```sh
npm test
npm run build
npm run preview
```

Open `http://127.0.0.1:4173`. Rebuild after content changes. `dist/` is the complete deployable website; serve it over HTTP rather than opening a file URL. Research pages are real static HTML and remain readable without JavaScript.

## Publish to GitHub Pages

Target: `https://mostakchy055.github.io/`. This is the intended address, not proof of a completed deployment.

1. Create the public repository `MostakChy055/MostakChy055.github.io` (or use an existing repository after reviewing its contents).
2. Upload this project's source, including `.github/workflows/pages.yml`, `content/`, `lib/`, `scripts/`, `tests/`, `public/`, `package.json`, and `MostakMahmudAcademicCV.pdf`. Do not upload `dist/`, credentials, or downloaded research PDFs.
3. In repository **Settings → Pages**, select **GitHub Actions** as the source.
4. Push to `main` or run **Actions → Publish academic portfolio → Run workflow**.
5. Wait for the deploy job to succeed. Its environment URL is the published site.

The workflow tests, builds, uploads only `dist/`, and deploys to Pages. No paid hosting or server is required. If using a project repository instead, set `siteUrl` in `content/config.json` to `https://USERNAME.github.io/REPOSITORY` and update `repository`. Generated links support a repository subpath.

The original PDF includes the owner's phone/email and named references; it is copied to the deployed site as requested. Replace that file if you want a different public CV.

## Update content

Edit JSON in `content/sections/` for homepage sections. Each research item is a file in `content/papers/`. Commit changes to `main`; the workflow rebuilds automatically. Rendered HTML is generated, so do not edit `dist/`.

All papers and the thesis share these ordered section IDs:

```text
concept → question → method → findings → limitations → discussion
```

Each section uses `{ "id": "method", "title": "Approach & techniques", "paragraphs": ["..."], "links": [{ "label": "Source", "url": "https://..." }] }`. Links are optional. Content is plain text and escaped during rendering; HTML is not accepted as markup.

Add another paper:

```sh
npm run content -- template my-new-paper
# Edit content/papers/my-new-paper.json and replace every template field.
npm run content -- validate
npm test
npm run build
```

The new paper is automatically included in the publication list, its own research page, the sitemap, and JSON endpoints. `kind: "thesis"` designates the single featured thesis. Update the existing thesis rather than adding a second featured item.

## Public read API

Paths are relative to the site's deployment root. All return JSON via `GET`:

| Endpoint | Content |
| --- | --- |
| `api/v1/index.json` | API index |
| `api/v1/sections.json` | All homepage sections |
| `api/v1/sections/{id}.json` | A homepage section |
| `api/v1/papers.json` | All research records |
| `api/v1/papers/{id}.json` | A paper or thesis |
| `api/v1/papers/{id}/sections/{sectionId}.json` | An individual research section |
| `api/v1/papers/{id}/discussion.json` | Editorial prompts and discussion mapping |

For example:

```js
const response = await fetch('./api/v1/papers/multimodal-memes.json');
if (!response.ok) throw new Error(`HTTP ${response.status}`);
const paper = await response.json();
```

These are static read endpoints. GitHub Pages cannot execute POST/PATCH requests or hold a database. Writes use the authenticated GitHub API described below. There is no pretend write endpoint or browser-local comment storage.

## Authenticated content API

`lib/github-api.mjs` supplies a Node.js API around GitHub's Contents REST API and Discussions GraphQL API. Import it from a local admin script or trusted server. Credentials are **never** included in the deployed assets. Supply `GITHUB_TOKEN` through your shell's secure environment mechanism; never commit or paste it into website JavaScript.

For content edits, use a fine-grained token limited to this repository with **Contents: read/write**. For comments, grant **Discussions: read/write**. Creating or changing Actions workflow files requires the appropriate Workflows permission. Repository Pages administration requires Pages write permission. GitHub still enforces the acting account's access.

```js
import { PortfolioAPI } from './lib/github-api.mjs';

const api = new PortfolioAPI({
  repository: 'MostakChy055/MostakChy055.github.io',
  branch: 'main',
  token: process.env.GITHUB_TOKEN
});

const { data: paper, sha } = await api.getPaper('multimodal-memes');
const method = paper.sections.find(section => section.id === 'method');
await api.updatePaperSection(paper.id, {
  ...method,
  paragraphs: ['Your revised, source-supported explanation.']
}, sha);
```

Available methods:

- `getPaper(id)` / `getSiteSection(id)` → `{ data, sha }`
- `addPaper(paper)` → creates a validated record; refuses to overwrite an existing file
- `updatePaper(paper, expectedSha)` → replaces a complete validated record
- `updatePaperSection(paperId, section, expectedSha)` → preserves the other sections
- `updateDiscussionPrompts(paperId, prompts, expectedSha)` → updates editorial discussion starters
- `updateSiteSection(section, expectedSha)` → replaces a validated homepage section

Use the SHA returned when you read the record. Stale updates fail instead of silently overwriting newer changes. Content commits trigger the Pages workflow when made with an appropriately authorized user token; allow the build/deploy to finish before expecting the public JSON to change.

CLI equivalents:

```sh
npm run content -- get-paper multimodal-memes
node scripts/content.mjs get-paper multimodal-memes > /tmp/paper-edit.json
# Edit the data field while retaining sha.
npm run content -- update-paper /tmp/paper-edit.json
npm run content -- add-paper content/papers/my-new-paper.json
```

The `update-paper` and `update-section` commands accept a `{ "data": {...}, "sha": "..." }` envelope. `add-paper` accepts a plain paper record. These commands write to GitHub; normal local editing does not require a token.

## Enable public comments

Comments use **giscus + GitHub Discussions**. They persist on GitHub, can be moderated there, and require GitHub sign-in to post. Until configured, the site accurately shows that comments are pending and offers email contact.

1. Enable Discussions in the public repository's settings.
2. Install the giscus GitHub app for this repository through [giscus.app](https://giscus.app/).
3. Create an Announcements-style discussion category, such as **Research discussions**.
4. Use giscus's configuration form to obtain the repository and category IDs.
5. Set `giscus.repoId`, `giscus.category`, and `giscus.categoryId` in `content/config.json`, then commit.

Each research page maps to a stable, exact title: `research/{paperId}`. Keep IDs stable when retitling a paper. The widget loads only when the visitor selects **Load comments**. Editorial discussion prompts are visibly identified; no fabricated reader comments are included.

Programmatic comment management:

```js
const result = await api.findDiscussion('multimodal-memes');
const discussion = result.items[0];
// If absent, the first giscus comment creates it; alternatively use createDiscussion().
if (discussion) {
  const page = await api.listComments(discussion.id);
  const comment = await api.addComment(discussion.id, 'A source-supported question.');
  await api.updateComment(comment.id, 'A revised question.');
  await api.addComment(discussion.id, 'A reply.', comment.id);
  const replies = await api.listReplies(comment.id);
  // await api.deleteComment(comment.id); // Destructive; invoke deliberately.
}
```

`findDiscussion`, `listComments`, and `listReplies` return `{ items, pageInfo }`; pass `pageInfo.endCursor` as the second argument while `hasNextPage` is true. Comment objects consistently use `{ id, body, author, createdAt, updatedAt, url }`. `createDiscussion(paperId, repositoryId, categoryId, body)` creates a discussion explicitly. Use the signed-in user's credentials for posting; never expose an owner token to visitors.

## Research provenance and remaining inputs

- All four full papers were read. Original publication, PDF, and repository links appear in each note. Later research links support proposed extensions, which are explicitly separated from the original experiments.
- **Thesis:** the supplied CV establishes the title and research scope. The manuscript is missing, so the site does not invent an implemented architecture, datasets, or numerical results. Add the manuscript URL and verified findings to `content/papers/video-colorization.json` when available.
- **CheckThat!:** Tables 3–4 and detailed analysis report Arabic **0.530**, Dutch **0.543**, English **0.745**. The abstract and CV swap the latter two. The note follows the tables and explains this. The paper's metric averaging labels are inconsistent, so the site says “reported F1.”
- **Multimodal paper:** the ACL page/CV say pp. 459–464, while the PDF says pp. 537–542. The citation uses the stable DOI without choosing between page ranges. The PDF's Tamil training count also differs between table and prose; the note avoids repeating the inconsistent count.
- **Scholarships:** eight consecutive semester scholarships come from the owner's supplied statement.
- **Samsung:** accomplishments follow the CV. Invention contributions are not described as granted patents; confidential details remain at the CV's public level.
- **Newsletter:** description follows the CV and user brief; no unverified issue titles, subscriber totals, or publication schedule are invented.

## Verification

`npm test` checks content contracts, unsafe URLs, escaping, common research sections, API concurrency protection, comment normalization/pagination, generated JSON, local links, and article anchors. API tests use fixtures; live GitHub authorization and giscus must be verified after connecting the actual repository. `npm run build` publishes only intended assets into `dist/`.

Initial delivery verification: all 10 automated checks passed. Headless browser checks passed for widths 320, 390, 768, and 1440 pixels, all five research pages, publication filters, citation copying, and reading without JavaScript, with no page-script errors. Browser checks used the generated files directly because this environment rejected localhost HTTP navigation. Hosted HTTP behavior, GitHub writes, and live comments remain unverified until the account and repository are connected.

References: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [Contents API](https://docs.github.com/en/rest/repos/contents), [GitHub GraphQL](https://docs.github.com/en/graphql/reference), [giscus](https://giscus.app/).
# MostakChy055.github.io
