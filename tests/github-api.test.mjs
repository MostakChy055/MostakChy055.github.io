import test from 'node:test';
import assert from 'node:assert/strict';
import { PortfolioAPI } from '../lib/github-api.mjs';
import { loadContent } from '../scripts/build.mjs';

const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
function mockAPI(replies) {
  const calls = [];
  const api = new PortfolioAPI({ repository: 'owner/site', token: 'test-token', fetchImpl: async (url, init) => {
    calls.push({ url, ...init, body: init.body ? JSON.parse(init.body) : undefined });
    if (!replies.length) throw new Error('Unexpected request');
    return replies.shift();
  } });
  return { api, calls };
}
test('new paper writes UTF-8 JSON with no SHA and does not overwrite existing content', async () => {
  const { papers } = await loadContent();
  const { api, calls } = mockAPI([response({ commit: { sha: 'new' } }, 201)]);
  await api.addPaper(papers[0]);
  assert.equal(calls[0].method, 'PUT');
  assert.equal(calls[0].body.sha, undefined);
  assert.equal(calls[0].body.branch, 'main');
  assert.deepEqual(JSON.parse(Buffer.from(calls[0].body.content, 'base64').toString('utf8')), papers[0]);
});
test('section edit preserves siblings and uses optimistic concurrency', async () => {
  const { papers } = await loadContent();
  const paper = papers[0];
  const { api, calls } = mockAPI([response({ content: Buffer.from(JSON.stringify(paper)).toString('base64'), encoding: 'base64', sha: 'original' }), response({})]);
  const section = { ...paper.sections[2], paragraphs: ['Updated methods.'] };
  await api.updatePaperSection(paper.id, section, 'original');
  const updated = JSON.parse(Buffer.from(calls[1].body.content, 'base64').toString('utf8'));
  assert.deepEqual(updated.sections[2], section);
  assert.deepEqual(updated.sections[0], paper.sections[0]);
  assert.equal(calls[1].body.sha, 'original');
});
test('stale edits and path traversal fail before any write', async () => {
  const { papers } = await loadContent();
  const paper = papers[0];
  const { api, calls } = mockAPI([response({ content: Buffer.from(JSON.stringify(paper)).toString('base64'), encoding: 'base64', sha: 'newer' })]);
  await assert.rejects(api.updatePaperSection(paper.id, paper.sections[0], 'stale'), /Content changed/);
  await assert.rejects(api.updatePaper(paper), /expectedSha/);
  assert.throws(() => api.getPaper('../config'), /Invalid content/);
  assert.equal(calls.length, 1);
});
test('GitHub conflicts are surfaced without exposing credentials', async () => {
  const { api } = mockAPI([response({ message: 'private details' }, 409)]);
  await assert.rejects(api.request('/test'), error => error.status === 409 && !error.message.includes('test-token') && /concurrent/.test(error.message));
});
test('comment API preserves pagination and uses a common normalized structure', async () => {
  const comment = { id: 'C1', body: 'A question', createdAt: '2026-11-25', updatedAt: '2026-11-25', url: 'https://github.com/owner/site/discussions/1', author: { login: 'reader' } };
  const { api, calls } = mockAPI([
    response({ data: { node: { comments: { nodes: [comment], pageInfo: { hasNextPage: true, endCursor: 'next' } } } } }),
    response({ data: { addDiscussionComment: { comment } } }),
    response({ data: { updateDiscussionComment: { comment: { ...comment, body: 'Edited' } } } }),
    response({ data: { deleteDiscussionComment: { clientMutationId: null } } })
  ]);
  const list = await api.listComments('D1', 'cursor');
  assert.equal(list.items[0].author, 'reader');
  assert.equal(list.pageInfo.endCursor, 'next');
  assert.equal(calls[0].body.variables.after, 'cursor');
  assert.equal((await api.addComment('D1', 'A question', 'C0')).id, 'C1');
  assert.equal(calls[1].body.variables.input.replyToId, 'C0');
  assert.equal((await api.updateComment('C1', 'Edited')).body, 'Edited');
  await api.deleteComment('C1');
  assert.equal(calls[3].body.variables.input.id, 'C1');
});
test('comment input and GraphQL failures are not silently accepted', async () => {
  const { api, calls } = mockAPI([response({ errors: [{ message: 'denied' }] })]);
  await assert.rejects(api.addComment('D1', ' '), /body/);
  assert.equal(calls.length, 0);
  await assert.rejects(api.listComments('D1'), /Discussions request failed/);
});
