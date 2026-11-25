import { assertId, validatePaper, validatePaperSection, validateSiteSection } from './content.mjs';

/** Owner-side API. Import from Node, never bundle a GitHub token into the website. */
export class PortfolioAPI {
  constructor({ repository, branch = 'main', token, fetchImpl = fetch }) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid repository');
    if (!token) throw new Error('GITHUB_TOKEN is required for the authenticated API');
    this.repository = repository;
    this.branch = branch;
    this.token = token;
    this.fetch = fetchImpl;
  }
  async request(endpoint, { method = 'GET', body } = {}) {
    const response = await this.fetch(`https://api.github.com${endpoint}`, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    if (!response.ok) {
      const error = new Error(`GitHub request failed (${response.status}). ${[409, 422].includes(response.status) ? 'Read the latest content and retry; concurrent changes are never overwritten automatically.' : 'Check repository access and token permissions.'}`);
      error.status = response.status;
      throw error;
    }
    return response.status === 204 ? null : response.json();
  }
  async readFile(file) {
    const result = await this.request(`/repos/${this.repository}/contents/${file}?ref=${encodeURIComponent(this.branch)}`);
    if (result.encoding !== 'base64' || !result.content || !result.sha) throw new Error('Expected a JSON content file');
    return { data: JSON.parse(Buffer.from(result.content, 'base64').toString('utf8')), sha: result.sha };
  }
  async writeFile(file, data, { sha, message }) {
    return this.request(`/repos/${this.repository}/contents/${file}`, { method: 'PUT', body: { branch: this.branch, message, content: Buffer.from(JSON.stringify(data, null, 2) + '\n').toString('base64'), ...(sha ? { sha } : {}) } });
  }
  getPaper(id) { return this.readFile(`content/papers/${assertId(id)}.json`); }
  getSiteSection(id) { assertId(id); return this.readFile(`content/sections/${id}.json`); }
  async addPaper(paper) {
    validatePaper(paper);
    // Omitting a SHA makes GitHub reject creation if this file already exists.
    return this.writeFile(`content/papers/${paper.id}.json`, paper, { message: `Add research: ${paper.shortTitle}` });
  }
  async updatePaper(paper, expectedSha) {
    validatePaper(paper);
    if (!expectedSha) throw new Error('expectedSha is required to protect concurrent edits');
    return this.writeFile(`content/papers/${paper.id}.json`, paper, { sha: expectedSha, message: `Update research: ${paper.shortTitle}` });
  }
  async updatePaperSection(id, section, expectedSha) {
    assertId(id); validatePaperSection(section);
    if (!expectedSha) throw new Error('expectedSha is required');
    const current = await this.getPaper(id);
    if (current.sha !== expectedSha) throw new Error('Content changed; read the latest paper before updating');
    const paper = current.data;
    paper.sections = paper.sections.map(item => item.id === section.id ? section : item);
    return this.updatePaper(paper, expectedSha);
  }
  async updateDiscussionPrompts(id, prompts, expectedSha) {
    const current = await this.getPaper(id);
    if (!expectedSha || current.sha !== expectedSha) throw new Error('Content changed or expectedSha missing');
    return this.updatePaper({ ...current.data, discussionPrompts: prompts }, expectedSha);
  }
  async updateSiteSection(section, expectedSha) {
    validateSiteSection(section);
    if (!expectedSha) throw new Error('expectedSha is required');
    return this.writeFile(`content/sections/${section.id}.json`, section, { sha: expectedSha, message: `Update portfolio section: ${section.id}` });
  }
  async graphql(query, variables) {
    const result = await this.request('/graphql', { method: 'POST', body: { query, variables } });
    if (result.errors?.length) throw new Error('GitHub Discussions request failed. Verify IDs, permissions, and that Discussions is enabled.');
    return result.data;
  }
  async findDiscussion(paperId, after = null) {
    assertId(paperId);
    const data = await this.graphql(`query($query: String!, $after: String) { search(query: $query, type: DISCUSSION, first: 50, after: $after) { nodes { ... on Discussion { id number title url } } pageInfo { hasNextPage endCursor } } }`, { query: `repo:${this.repository} in:title "research/${paperId}"`, after });
    return { items: data.search.nodes.filter(node => node.title === `research/${paperId}`), pageInfo: data.search.pageInfo };
  }
  async createDiscussion(paperId, repositoryId, categoryId, body) {
    assertId(paperId);
    requireBody(body);
    const data = await this.graphql(`mutation($input: CreateDiscussionInput!) { createDiscussion(input: $input) { discussion { id number title url } } }`, { input: { repositoryId, categoryId, title: `research/${paperId}`, body } });
    return data.createDiscussion.discussion;
  }
  async listComments(discussionId, after = null) {
    const data = await this.graphql(`query($id: ID!, $after: String) { node(id: $id) { ... on Discussion { comments(first: 50, after: $after) { nodes { id body createdAt updatedAt url author { login } } pageInfo { hasNextPage endCursor } } } }`, { id: discussionId, after });
    if (!data.node?.comments) throw new Error('Discussion not found');
    return { items: data.node.comments.nodes.map(normalizeComment), pageInfo: data.node.comments.pageInfo };
  }
  async listReplies(commentId, after = null) {
    const data = await this.graphql(`query($id: ID!, $after: String) { node(id: $id) { ... on DiscussionComment { replies(first: 50, after: $after) { nodes { id body createdAt updatedAt url author { login } } pageInfo { hasNextPage endCursor } } } }`, { id: commentId, after });
    if (!data.node?.replies) throw new Error('Comment not found');
    return { items: data.node.replies.nodes.map(normalizeComment), pageInfo: data.node.replies.pageInfo };
  }
  async addComment(discussionId, body, replyToId) {
    requireBody(body);
    const data = await this.graphql(`mutation($input: AddDiscussionCommentInput!) { addDiscussionComment(input: $input) { comment { id body createdAt updatedAt url author { login } } } }`, { input: { discussionId, body, ...(replyToId ? { replyToId } : {}) } });
    return normalizeComment(data.addDiscussionComment.comment);
  }
  async updateComment(commentId, body) {
    requireBody(body);
    const data = await this.graphql(`mutation($input: UpdateDiscussionCommentInput!) { updateDiscussionComment(input: $input) { comment { id body createdAt updatedAt url author { login } } } }`, { input: { commentId, body } });
    return normalizeComment(data.updateDiscussionComment.comment);
  }
  async deleteComment(commentId) {
    await this.graphql(`mutation($input: DeleteDiscussionCommentInput!) { deleteDiscussionComment(input: $input) { clientMutationId } }`, { input: { id: commentId } });
  }
}
function requireBody(body) {
  if (typeof body !== 'string' || !body.trim() || body.length > 60000) throw new Error('Comment body must contain 1–60000 characters');
}
export function normalizeComment(comment) {
  return { id: comment.id, body: comment.body, author: comment.author?.login ?? 'Deleted account', createdAt: comment.createdAt, updatedAt: comment.updatedAt, url: comment.url };
}
