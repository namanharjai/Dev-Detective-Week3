const API_BASE = 'https://api.github.com/users';
const API_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28'
};

const userCache = new Map();
const latestRepoCache = new Map();
const repoCache = new Map();

const tabButtons = document.querySelectorAll('.tab-button');
const panels = document.querySelectorAll('.panel');

const searchForm = document.getElementById('search-form');
const usernameInput = document.getElementById('username-input');
const searchFeedback = document.getElementById('search-feedback');
const profileResult = document.getElementById('profile-result');

const battleForm = document.getElementById('battle-form');
const battleUserOne = document.getElementById('battle-user-one');
const battleUserTwo = document.getElementById('battle-user-two');
const battleMetric = document.getElementById('battle-metric');
const battleFeedback = document.getElementById('battle-feedback');
const battleResult = document.getElementById('battle-result');

const profileCardTemplate = document.getElementById('profile-card-template');
const battleCardTemplate = document.getElementById('battle-card-template');

init();

function init() {
  bindTabSwitching();
  searchForm.addEventListener('submit', handleSearch);
  battleForm.addEventListener('submit', handleBattle);
  renderSearchEmptyState();
  renderBattleEmptyState();
}

function bindTabSwitching() {
  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const selectedTab = button.dataset.tab;

      tabButtons.forEach((tab) => tab.classList.toggle('is-active', tab === button));
      panels.forEach((panel) => panel.classList.toggle('is-active', panel.id === `${selectedTab}-panel`));
    });
  });
}

async function handleSearch(event) {
  event.preventDefault();
  const username = usernameInput.value.trim();

  if (!username) {
    setFeedback(searchFeedback, 'Please enter a GitHub username first.', 'error');
    renderSearchEmptyState();
    return;
  }

  setFeedback(searchFeedback, createLoadingMarkup('Looking up profile...'));
  profileResult.innerHTML = '';

  try {
    const [user, repos] = await Promise.all([
      fetchUser(username),
      fetchLatestRepos(username)
    ]);

    renderProfile(user, repos);
    setFeedback(searchFeedback, `Showing results for @${user.login}.`, 'success');
  } catch (error) {
    setFeedback(searchFeedback, error.message, 'error');
    renderSearchEmptyState();
  }
}

async function handleBattle(event) {
  event.preventDefault();
  const first = battleUserOne.value.trim();
  const second = battleUserTwo.value.trim();
  const metric = battleMetric.value;

  if (!first || !second) {
    setFeedback(battleFeedback, 'Please enter both usernames before starting the battle.', 'error');
    renderBattleEmptyState();
    return;
  }

  if (first.toLowerCase() === second.toLowerCase()) {
    setFeedback(battleFeedback, 'Pick two different GitHub usernames for comparison.', 'error');
    renderBattleEmptyState();
    return;
  }

  setFeedback(
    battleFeedback,
    createLoadingMarkup(`Comparing by ${metric === 'followers' ? 'followers' : 'total stars'}...`)
  );
  battleResult.innerHTML = '';

  try {
    const [left, right] = await Promise.all([
      buildBattleData(first),
      buildBattleData(second)
    ]);

    renderBattleCards(left, right, metric);
    setFeedback(
      battleFeedback,
      `Battle complete. Compared by ${metric === 'followers' ? 'followers' : 'total stars'}.`,
      'success'
    );
  } catch (error) {
    setFeedback(battleFeedback, error.message, 'error');
    renderBattleEmptyState();
  }
}

async function fetchUser(username) {
  const key = username.toLowerCase();

  if (userCache.has(key)) {
    return userCache.get(key);
  }

  const response = await fetch(`${API_BASE}/${encodeURIComponent(username)}`, {
    headers: API_HEADERS
  });

  if (!response.ok) {
    throw await buildApiError(response, username);
  }

  const data = await response.json();
  userCache.set(key, data);
  return data;
}

async function fetchLatestRepos(username) {
  const key = username.toLowerCase();

  if (latestRepoCache.has(key)) {
    return latestRepoCache.get(key);
  }

  const response = await fetch(
    `${API_BASE}/${encodeURIComponent(username)}/repos?sort=updated&per_page=5&type=owner`,
    { headers: API_HEADERS }
  );

  if (!response.ok) {
    throw await buildApiError(response, username);
  }

  const data = await response.json();
  latestRepoCache.set(key, data);
  return data;
}

async function fetchAllRepos(username) {
  const key = username.toLowerCase();

  if (repoCache.has(key)) {
    return repoCache.get(key);
  }

  const allRepos = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await fetch(
      `${API_BASE}/${encodeURIComponent(username)}/repos?per_page=100&page=${page}&type=owner`,
      { headers: API_HEADERS }
    );

    if (!response.ok) {
      throw await buildApiError(response, username);
    }

    const repos = await response.json();
    allRepos.push(...repos);

    if (repos.length < 100) {
      hasMore = false;
    } else {
      page += 1;
    }
  }

  repoCache.set(key, allRepos);
  return allRepos;
}

async function buildBattleData(username) {
  const [user, repos] = await Promise.all([
    fetchUser(username),
    fetchAllRepos(username)
  ]);

  const totalStars = repos.reduce((sum, repo) => sum + Number(repo.stargazers_count || 0), 0);

  return {
    user,
    followers: user.followers,
    totalStars
  };
}

async function buildApiError(response, username) {
  if (response.status === 404) {
    return new Error(`User "${username}" was not found. Please check the username and try again.`);
  }

  if (response.status === 403) {
    const remaining = response.headers.get('x-ratelimit-remaining');
    if (remaining === '0') {
      return new Error('GitHub API rate limit reached. Please wait a while and try again.');
    }
    return new Error('GitHub did not allow this request right now. Please try again in a moment.');
  }

  return new Error(`Unable to fetch data from GitHub right now. Status code: ${response.status}.`);
}

function renderProfile(user, repos) {
  const card = profileCardTemplate.content.firstElementChild.cloneNode(true);

  card.querySelector('.avatar').src = user.avatar_url;
  card.querySelector('.avatar').alt = `${user.login} avatar`;
  card.querySelector('.name').textContent = user.name || user.login;

  const usernameLink = card.querySelector('.username-link');
  usernameLink.textContent = `@${user.login}`;
  usernameLink.href = user.html_url;

  const bioNode = card.querySelector('.bio');
  bioNode.textContent = user.bio || 'No bio available.';
  bioNode.classList.toggle('is-empty', !user.bio);

  card.querySelector('.followers').textContent = formatNumber(user.followers);
  card.querySelector('.following').textContent = formatNumber(user.following);
  card.querySelector('.repos').textContent = formatNumber(user.public_repos);
  card.querySelector('.joined').textContent = formatDate(user.created_at);

  const portfolioNode = card.querySelector('.portfolio');
  portfolioNode.innerHTML = '';
  if (user.blog) {
    const blogLink = document.createElement('a');
    blogLink.href = normalizeUrl(user.blog);
    blogLink.target = '_blank';
    blogLink.rel = 'noreferrer noopener';
    blogLink.textContent = user.blog;
    portfolioNode.appendChild(blogLink);
  } else {
    portfolioNode.textContent = 'Not available';
  }

  card.querySelector('.view-profile-link').href = user.html_url;

  const repoList = card.querySelector('.repo-list');
  if (!repos.length) {
    const emptyItem = document.createElement('p');
    emptyItem.className = 'repo-empty';
    emptyItem.textContent = 'No public repositories available to show.';
    repoList.replaceWith(emptyItem);
  } else {
    repos.forEach((repo) => repoList.appendChild(createRepoItem(repo)));
  }

  profileResult.innerHTML = '';
  profileResult.appendChild(card);
}

function createRepoItem(repo) {
  const item = document.createElement('li');
  item.className = 'repo-item';

  const language = repo.language || 'Not specified';
  const description = repo.description || 'No description provided.';
  const updatedAt = formatDate(repo.updated_at);

  item.innerHTML = `
    <div class="repo-item-header">
      <a class="repo-link" href="${repo.html_url}" target="_blank" rel="noreferrer noopener">${escapeHtml(repo.name)}</a>
      <span>${updatedAt}</span>
    </div>
    <p class="repo-description">${escapeHtml(description)}</p>
    <div class="repo-meta">
      <span>⭐ ${formatNumber(repo.stargazers_count)}</span>
      <span>🍴 ${formatNumber(repo.forks_count)}</span>
      <span>🧠 ${escapeHtml(language)}</span>
    </div>
  `;
  return item;
}

function renderBattleCards(left, right, metric) {
  const leftScore = metric === 'followers' ? left.followers : left.totalStars;
  const rightScore = metric === 'followers' ? right.followers : right.totalStars;

  let leftStatus = 'tie';
  let rightStatus = 'tie';

  if (leftScore > rightScore) {
    leftStatus = 'winner';
    rightStatus = 'loser';
  } else if (leftScore < rightScore) {
    leftStatus = 'loser';
    rightStatus = 'winner';
  }

  battleResult.innerHTML = '';
  battleResult.appendChild(createBattleCard(left, metric, leftStatus));
  battleResult.appendChild(createBattleCard(right, metric, rightStatus));
}

function createBattleCard(data, metric, status) {
  const { user, totalStars } = data;
  const card = battleCardTemplate.content.firstElementChild.cloneNode(true);
  const scoreValue = metric === 'followers' ? user.followers : totalStars;

  card.classList.add(`is-${status}`);

  card.querySelector('.avatar').src = user.avatar_url;
  card.querySelector('.avatar').alt = `${user.login} avatar`;
  card.querySelector('.name').textContent = user.name || user.login;

  const usernameLink = card.querySelector('.username-link');
  usernameLink.textContent = `@${user.login}`;
  usernameLink.href = user.html_url;

  const bioNode = card.querySelector('.battle-bio');
  bioNode.textContent = user.bio || 'No bio available.';
  bioNode.classList.toggle('is-empty', !user.bio);

  card.querySelector('.battle-score').textContent = `${formatNumber(scoreValue)} ${metric === 'followers' ? 'followers' : 'stars'}`;
  card.querySelector('.followers').textContent = formatNumber(user.followers);
  card.querySelector('.repos').textContent = formatNumber(user.public_repos);
  card.querySelector('.stars').textContent = formatNumber(totalStars);

  const statusNode = card.querySelector('.battle-status');
  if (status === 'winner') {
    statusNode.textContent = 'Winner';
    statusNode.className = 'battle-status status-success';
  } else if (status === 'loser') {
    statusNode.textContent = 'Runner-up';
    statusNode.className = 'battle-status status-danger';
  } else {
    statusNode.textContent = 'Tie';
    statusNode.className = 'battle-status status-info';
  }

  return card;
}

function renderSearchEmptyState() {
  profileResult.innerHTML = `
    <div class="empty-state">
      Search for a username like <strong>octocat</strong>, <strong>torvalds</strong>, or your own GitHub profile.
    </div>
  `;
}

function renderBattleEmptyState() {
  battleResult.innerHTML = `
    <div class="empty-state">Enter two GitHub usernames and compare them by followers or total stars.</div>
  `;
}

function setFeedback(element, content, type = '') {
  element.className = 'feedback';
  if (type) {
    element.classList.add(`is-${type}`);
  }

  if (typeof content === 'string' && content.includes('<span class="spinner"></span>')) {
    element.innerHTML = content;
  } else {
    element.textContent = typeof content === 'string' ? content : '';
  }
}

function createLoadingMarkup(text) {
  return `<span class="loading"><span class="spinner" aria-hidden="true"></span>${text}</span>`;
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(dateString));
}

function normalizeUrl(url) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-IN').format(Number(value) || 0);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
