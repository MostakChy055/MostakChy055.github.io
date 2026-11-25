const filters = document.querySelector('.filters');
if (filters) {
  filters.hidden = false;
  filters.addEventListener('click', event => {
    const button = event.target.closest('button[data-filter]');
    if (!button) return;
    filters.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    let count = 0;
    document.querySelectorAll('.publication').forEach(paper => {
      const match = button.dataset.filter === 'all' || paper.dataset.tags.split('|').includes(button.dataset.filter);
      paper.hidden = !match;
      if (match) count++;
    });
    document.querySelector('#filter-status').textContent = `${count} publications shown`;
  });
}
document.querySelectorAll('[data-copy]').forEach(button => {
  button.hidden = false;
  button.addEventListener('click', async () => {
    const source = document.getElementById(button.dataset.copy);
    const status = button.nextElementSibling;
    try {
      await navigator.clipboard.writeText(source.textContent);
      status.textContent = 'Citation copied.';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(source);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      status.textContent = 'Citation selected. Use your device’s copy command.';
    }
  });
});
const commentButton = document.querySelector('#load-comments');
commentButton?.addEventListener('click', () => {
  const status = document.querySelector('#comments-status');
  commentButton.disabled = true;
  status.textContent = 'Loading GitHub Discussions…';
  const script = document.createElement('script');
  script.src = 'https://giscus.app/client.js';
  script.async = true;
  script.crossOrigin = 'anonymous';
  const attributes = {
    repo: commentButton.dataset.repo,
    'repo-id': commentButton.dataset.repoId,
    category: commentButton.dataset.category,
    'category-id': commentButton.dataset.categoryId,
    mapping: 'specific', term: commentButton.dataset.term,
    strict: '1', 'reactions-enabled': '1', 'emit-metadata': '0',
    'input-position': 'top', theme: 'light', lang: 'en', loading: 'lazy'
  };
  Object.entries(attributes).forEach(([key, value]) => script.setAttribute(`data-${key}`, value));
  script.onload = () => { status.textContent = 'If comments do not appear, use the GitHub Discussions link below.'; commentButton.hidden = true; };
  script.onerror = () => { status.textContent = 'Comments could not load. Try again or open the discussion on GitHub.'; commentButton.disabled = false; script.remove(); };
  document.querySelector('.giscus').append(script);
});
