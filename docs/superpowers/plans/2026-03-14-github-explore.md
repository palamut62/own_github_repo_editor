# GitHub Explore Feature — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Discovery sidebar category with Search, Trending, and Topics pages for exploring GitHub repositories, with star/fork/clone actions and a repo detail modal.

**Architecture:** New sidebar category follows existing collapsible `.nav-category` pattern. Three new view sections (`view-exploreSearch`, `view-exploreTrending`, `view-exploreTopics`) added to the main content area. IPC handlers in main.js wrap GitHub Search API, starring, and forking endpoints. A shared repo detail modal shows README, languages, commits.

**Tech Stack:** Electron IPC, GitHub REST API (Search, Starring, Forking), inline HTML/CSS/JS in index.html, Node.js https in main.js

---

## Task 1: Add IPC Handlers in main.js

**Files:**
- Modify: `main.js` (add after line ~2177, after `createGitignore` handler)
- Modify: `preload.js` (add new API bindings)

- [ ] **Step 1: Add `searchRepos` IPC handler to main.js**

Add after the last `ipcMain.handle`:

```javascript
// ── GitHub Explore ──────────────────────────────────────────────────────────
ipcMain.handle('searchRepos', async (event, { token, query, language, sort, order, page }) => {
    try {
        let q = query || 'stars:>100';
        if (language) q += ` language:${language}`;
        const s = sort || 'stars';
        const o = order || 'desc';
        const p = page || 1;
        const result = await githubRequest(
            `/search/repositories?q=${encodeURIComponent(q)}&sort=${s}&order=${o}&per_page=30&page=${p}`,
            'GET', token
        );
        return result;
    } catch (e) {
        return { error: e.message };
    }
});

ipcMain.handle('searchTopics', async (event, { token, query }) => {
    try {
        const q = query || 'is:featured';
        const result = await githubRequest(
            `/search/topics?q=${encodeURIComponent(q)}&per_page=30`,
            'GET', token,
            null
        );
        return result;
    } catch (e) {
        return { error: e.message };
    }
});
```

Note: `searchTopics` needs the `mercy-preview` accept header. Update `githubRequest` or pass custom headers. Since `githubRequest` doesn't support custom headers, we'll use a modified call. Actually, the topics API works with the standard accept header as well for basic results, but for full topic data we need to add the preview header. For simplicity, add an optional headers parameter to `githubRequest`:

In `githubRequest` function (line ~121), change signature to:
```javascript
function githubRequest(path, method, token, body = null, extraHeaders = {}) {
```
And merge extraHeaders into the headers object:
```javascript
const options = {
    hostname: 'api.github.com',
    path: path,
    method: method,
    headers: {
        'User-Agent': 'GitHub-Repo-Cleaner',
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        ...extraHeaders
    }
};
```

Then update `searchTopics`:
```javascript
ipcMain.handle('searchTopics', async (event, { token, query }) => {
    try {
        const q = query || 'is:featured';
        const result = await githubRequest(
            `/search/topics?q=${encodeURIComponent(q)}&per_page=30`,
            'GET', token, null,
            { 'Accept': 'application/vnd.github.mercy-preview+json' }
        );
        return result;
    } catch (e) {
        return { error: e.message };
    }
});
```

- [ ] **Step 2: Add `starRepo`, `unstarRepo`, `checkStarred`, `forkRepo` IPC handlers**

```javascript
ipcMain.handle('starRepo', async (event, { token, fullName }) => {
    try {
        await githubRequest(`/user/starred/${fullName}`, 'PUT', token);
        return { success: true };
    } catch (e) {
        return { error: e.message };
    }
});

ipcMain.handle('unstarRepo', async (event, { token, fullName }) => {
    try {
        await githubRequest(`/user/starred/${fullName}`, 'DELETE', token);
        return { success: true };
    } catch (e) {
        return { error: e.message };
    }
});

ipcMain.handle('checkStarred', async (event, { token, fullName }) => {
    try {
        await githubRequest(`/user/starred/${fullName}`, 'GET', token);
        return { starred: true };
    } catch (e) {
        // 404 means not starred
        if (e.message && e.message.includes('404')) {
            return { starred: false };
        }
        return { error: e.message };
    }
});

ipcMain.handle('forkRepo', async (event, { token, fullName }) => {
    try {
        const result = await githubRequest(`/repos/${fullName}/forks`, 'POST', token);
        return result;
    } catch (e) {
        return { error: e.message };
    }
});
```

- [ ] **Step 3: Add `getExploreRepoDetail` IPC handler**

```javascript
ipcMain.handle('getExploreRepoDetail', async (event, { token, fullName }) => {
    try {
        const [repo, languages, commits, readme, starred] = await Promise.allSettled([
            githubRequest(`/repos/${fullName}`, 'GET', token),
            githubRequest(`/repos/${fullName}/languages`, 'GET', token),
            githubRequest(`/repos/${fullName}/commits?per_page=5`, 'GET', token),
            githubRequest(`/repos/${fullName}/readme`, 'GET', token),
            githubRequest(`/user/starred/${fullName}`, 'GET', token)
        ]);

        return {
            repo: repo.status === 'fulfilled' ? repo.value : null,
            languages: languages.status === 'fulfilled' ? languages.value : {},
            commits: commits.status === 'fulfilled' ? commits.value : [],
            readme: readme.status === 'fulfilled' ? readme.value : null,
            starred: starred.status === 'fulfilled' // 204 = starred
        };
    } catch (e) {
        return { error: e.message };
    }
});
```

- [ ] **Step 4: Add preload.js bindings**

Add to the `contextBridge.exposeInMainWorld('api', { ... })` object:

```javascript
// GitHub Explore
searchRepos: (data) => ipcRenderer.invoke('searchRepos', data),
searchTopics: (data) => ipcRenderer.invoke('searchTopics', data),
starRepo: (data) => ipcRenderer.invoke('starRepo', data),
unstarRepo: (data) => ipcRenderer.invoke('unstarRepo', data),
checkStarred: (data) => ipcRenderer.invoke('checkStarred', data),
forkRepo: (data) => ipcRenderer.invoke('forkRepo', data),
getExploreRepoDetail: (data) => ipcRenderer.invoke('getExploreRepoDetail', data),
```

- [ ] **Step 5: Commit**

```bash
git add main.js preload.js
git commit -m "feat(explore): add IPC handlers for search, star, fork, and repo detail"
```

---

## Task 2: Add Discovery Sidebar Category in index.html

**Files:**
- Modify: `index.html` (sidebar HTML, around line ~1225 after Organization category)

- [ ] **Step 1: Add Discovery nav-category after the Analytics category (around line ~1243)**

Insert before the sidebar footer / settings area:

```html
<!-- Discovery -->
<div class="nav-group">
    <div class="nav-category collapsed" id="catDiscovery">
        <div class="nav-category-header" onclick="toggleCategory('catDiscovery')">
            <div class="nav-title">Discovery</div>
            <span class="nav-category-arrow">▼</span>
        </div>
        <div class="nav-category-body">
            <div class="nav-item" id="navExploreSearch" onclick="showView('exploreSearch')">
                <span>🔍 Search</span>
            </div>
            <div class="nav-item" id="navExploreTrending" onclick="showView('exploreTrending')">
                <span>🔥 Trending</span>
            </div>
            <div class="nav-item" id="navExploreTopics" onclick="showView('exploreTopics')">
                <span>🏷️ Topics</span>
            </div>
        </div>
    </div>
</div>
```

- [ ] **Step 2: Update `showView()` function to handle new views**

In the `showView` function (~line 2196), add to the `titles` object:
```javascript
exploreSearch:    '🔍 Search Repositories',
exploreTrending:  '🔥 Trending Repositories',
exploreTopics:    '🏷️ Explore Topics',
```

Add to the nav active state array:
```javascript
['navDashboard','navAddProject','navRepos','navForkSync','navLocalChanges','navHistory',
 'navExploreSearch','navExploreTrending','navExploreTopics'].forEach(id => {
```

Add switch cases:
```javascript
case 'exploreSearch':
    document.getElementById('view-exploreSearch').style.display = 'flex';
    document.getElementById('navExploreSearch').classList.add('active');
    break;
case 'exploreTrending':
    document.getElementById('view-exploreTrending').style.display = 'flex';
    document.getElementById('navExploreTrending').classList.add('active');
    loadTrendingRepos();
    break;
case 'exploreTopics':
    document.getElementById('view-exploreTopics').style.display = 'flex';
    document.getElementById('navExploreTopics').classList.add('active');
    loadTopics();
    break;
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(explore): add Discovery sidebar category with Search, Trending, Topics"
```

---

## Task 3: Add Search View HTML and JS

**Files:**
- Modify: `index.html` (add view section HTML + JS functions)

- [ ] **Step 1: Add Search view HTML**

Add after the last `view-section` div (find the pattern `<div class="view-section" id="view-..."`):

```html
<!-- ═══════ EXPLORE: SEARCH ═══════ -->
<div class="view-section" id="view-exploreSearch" style="display:none; flex-direction:column; gap:16px;">
    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
        <input type="text" id="exploreSearchInput" placeholder="Search repositories..."
            style="flex:1; min-width:200px; padding:8px 12px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-input); color:var(--text-primary); font-size:14px;"
            onkeydown="if(event.key==='Enter') searchExploreRepos()">
        <select id="exploreSearchLang" style="padding:8px 12px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-input); color:var(--text-primary); font-size:13px;">
            <option value="">All Languages</option>
            <option value="JavaScript">JavaScript</option>
            <option value="TypeScript">TypeScript</option>
            <option value="Python">Python</option>
            <option value="Java">Java</option>
            <option value="Go">Go</option>
            <option value="Rust">Rust</option>
            <option value="C++">C++</option>
            <option value="C#">C#</option>
            <option value="PHP">PHP</option>
            <option value="Ruby">Ruby</option>
            <option value="Swift">Swift</option>
            <option value="Kotlin">Kotlin</option>
            <option value="Dart">Dart</option>
            <option value="Shell">Shell</option>
            <option value="HTML">HTML</option>
            <option value="CSS">CSS</option>
        </select>
        <select id="exploreSearchSort" style="padding:8px 12px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-input); color:var(--text-primary); font-size:13px;">
            <option value="stars">Stars</option>
            <option value="forks">Forks</option>
            <option value="updated">Recently Updated</option>
        </select>
        <input type="number" id="exploreSearchMinStars" placeholder="Min stars" min="0"
            style="width:100px; padding:8px 12px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-input); color:var(--text-primary); font-size:13px;">
        <button onclick="searchExploreRepos()" class="btn-primary" style="padding:8px 16px; border-radius:6px; font-size:13px; cursor:pointer; border:none;">
            🔍 Search
        </button>
    </div>
    <div id="exploreSearchResults" style="display:flex; flex-direction:column; gap:8px;"></div>
    <div id="exploreSearchLoadMore" style="display:none; text-align:center;">
        <button onclick="searchExploreRepos(true)" class="btn-primary" style="padding:8px 24px; border-radius:6px; font-size:13px; cursor:pointer; border:none; opacity:0.8;">
            Load More
        </button>
    </div>
</div>
```

- [ ] **Step 2: Add Search JS functions**

Add in the `<script>` section:

```javascript
// ═══════ EXPLORE: SEARCH ═══════
let exploreSearchPage = 1;
let exploreSearchTotalCount = 0;

async function searchExploreRepos(loadMore = false) {
    const token = await window.api.getToken();
    if (!token) { showToast('Please set your GitHub token first', 'error'); return; }

    const query = document.getElementById('exploreSearchInput').value.trim();
    const lang = document.getElementById('exploreSearchLang').value;
    const sort = document.getElementById('exploreSearchSort').value;
    const minStars = document.getElementById('exploreSearchMinStars').value;

    let q = query || 'stars:>100';
    if (minStars) q += ` stars:>=${minStars}`;

    if (!loadMore) {
        exploreSearchPage = 1;
        document.getElementById('exploreSearchResults').innerHTML = '';
    } else {
        exploreSearchPage++;
    }

    const resultsDiv = document.getElementById('exploreSearchResults');
    if (!loadMore) {
        const loading = document.createElement('div');
        loading.style.cssText = 'text-align:center; padding:40px; color:var(--text-secondary);';
        loading.textContent = 'Searching...';
        resultsDiv.appendChild(loading);
    }

    const result = await window.api.searchRepos({ token, query: q, language: lang, sort, order: 'desc', page: exploreSearchPage });

    if (!loadMore) resultsDiv.innerHTML = '';

    if (result.error) {
        showToast('Search failed: ' + result.error, 'error');
        return;
    }

    exploreSearchTotalCount = result.total_count || 0;
    const items = result.items || [];

    if (items.length === 0 && !loadMore) {
        const empty = document.createElement('div');
        empty.style.cssText = 'text-align:center; padding:40px; color:var(--text-secondary);';
        empty.textContent = 'No repositories found.';
        resultsDiv.appendChild(empty);
    }

    items.forEach(repo => {
        resultsDiv.appendChild(createExploreRepoCard(repo));
    });

    // Show/hide load more
    const shown = resultsDiv.children.length;
    document.getElementById('exploreSearchLoadMore').style.display =
        shown < exploreSearchTotalCount ? 'block' : 'none';
}

function createExploreRepoCard(repo) {
    const card = document.createElement('div');
    card.style.cssText = 'background:var(--bg-card); border:1px solid var(--border-color); border-radius:8px; padding:14px 16px; display:flex; flex-direction:column; gap:8px;';

    const topRow = document.createElement('div');
    topRow.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:8px;';

    const nameLink = document.createElement('span');
    nameLink.style.cssText = 'font-size:14px; font-weight:600; color:var(--accent-blue); cursor:pointer;';
    nameLink.textContent = repo.full_name;
    nameLink.addEventListener('click', () => openExploreDetailModal(repo.full_name));

    const statsDiv = document.createElement('div');
    statsDiv.style.cssText = 'display:flex; align-items:center; gap:12px; font-size:12px; color:var(--text-secondary); flex-shrink:0;';
    statsDiv.innerHTML = '';
    const starSpan = document.createElement('span');
    starSpan.textContent = '⭐ ' + (repo.stargazers_count || 0).toLocaleString();
    const forkSpan = document.createElement('span');
    forkSpan.textContent = '🍴 ' + (repo.forks_count || 0).toLocaleString();
    statsDiv.appendChild(starSpan);
    statsDiv.appendChild(forkSpan);

    topRow.appendChild(nameLink);
    topRow.appendChild(statsDiv);

    const desc = document.createElement('div');
    desc.style.cssText = 'font-size:13px; color:var(--text-secondary); line-height:1.4;';
    desc.textContent = repo.description || 'No description';

    const bottomRow = document.createElement('div');
    bottomRow.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;';

    const metaDiv = document.createElement('div');
    metaDiv.style.cssText = 'display:flex; align-items:center; gap:8px; font-size:11px; color:var(--text-secondary);';
    if (repo.language) {
        const langSpan = document.createElement('span');
        langSpan.style.cssText = 'background:var(--bg-input); padding:2px 8px; border-radius:10px;';
        langSpan.textContent = repo.language;
        metaDiv.appendChild(langSpan);
    }
    const updated = document.createElement('span');
    updated.textContent = 'Updated ' + new Date(repo.updated_at).toLocaleDateString();
    metaDiv.appendChild(updated);

    const actionsDiv = document.createElement('div');
    actionsDiv.style.cssText = 'display:flex; gap:6px;';

    const starBtn = document.createElement('button');
    starBtn.style.cssText = 'padding:4px 10px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-input); color:var(--text-primary); font-size:12px; cursor:pointer;';
    starBtn.textContent = '⭐ Star';
    starBtn.addEventListener('click', async () => {
        const token = await window.api.getToken();
        const res = await window.api.starRepo({ token, fullName: repo.full_name });
        if (res.success) { showToast('Starred ' + repo.full_name, 'success'); starBtn.textContent = '⭐ Starred'; }
        else showToast('Failed to star', 'error');
    });

    const forkBtn = document.createElement('button');
    forkBtn.style.cssText = 'padding:4px 10px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-input); color:var(--text-primary); font-size:12px; cursor:pointer;';
    forkBtn.textContent = '🍴 Fork';
    forkBtn.addEventListener('click', async () => {
        const token = await window.api.getToken();
        const res = await window.api.forkRepo({ token, fullName: repo.full_name });
        if (res && !res.error) { showToast('Forked ' + repo.full_name, 'success'); }
        else showToast('Failed to fork', 'error');
    });

    const cloneBtn = document.createElement('button');
    cloneBtn.style.cssText = 'padding:4px 10px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-input); color:var(--text-primary); font-size:12px; cursor:pointer;';
    cloneBtn.textContent = '📋 Clone';
    cloneBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(repo.clone_url);
        showToast('Clone URL copied!', 'success');
    });

    actionsDiv.appendChild(starBtn);
    actionsDiv.appendChild(forkBtn);
    actionsDiv.appendChild(cloneBtn);

    bottomRow.appendChild(metaDiv);
    bottomRow.appendChild(actionsDiv);

    card.appendChild(topRow);
    card.appendChild(desc);
    card.appendChild(bottomRow);

    return card;
}
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(explore): add Search view with filters and repo cards"
```

---

## Task 4: Add Trending View HTML and JS

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add Trending view HTML**

```html
<!-- ═══════ EXPLORE: TRENDING ═══════ -->
<div class="view-section" id="view-exploreTrending" style="display:none; flex-direction:column; gap:16px;">
    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
        <select id="exploreTrendingTime" onchange="loadTrendingRepos()" style="padding:8px 12px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-input); color:var(--text-primary); font-size:13px;">
            <option value="weekly">This Week</option>
            <option value="monthly">This Month</option>
            <option value="alltime">All Time</option>
        </select>
        <select id="exploreTrendingLang" onchange="loadTrendingRepos()" style="padding:8px 12px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-input); color:var(--text-primary); font-size:13px;">
            <option value="">All Languages</option>
            <option value="JavaScript">JavaScript</option>
            <option value="TypeScript">TypeScript</option>
            <option value="Python">Python</option>
            <option value="Java">Java</option>
            <option value="Go">Go</option>
            <option value="Rust">Rust</option>
            <option value="C++">C++</option>
            <option value="C#">C#</option>
            <option value="PHP">PHP</option>
            <option value="Ruby">Ruby</option>
            <option value="Swift">Swift</option>
            <option value="Kotlin">Kotlin</option>
        </select>
        <select id="exploreTrendingSort" onchange="loadTrendingRepos()" style="padding:8px 12px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-input); color:var(--text-primary); font-size:13px;">
            <option value="stars">Most Stars</option>
            <option value="forks">Most Forks</option>
        </select>
    </div>
    <div id="exploreTrendingResults" style="display:flex; flex-direction:column; gap:8px;"></div>
    <div id="exploreTrendingLoadMore" style="display:none; text-align:center;">
        <button onclick="loadTrendingRepos(true)" class="btn-primary" style="padding:8px 24px; border-radius:6px; font-size:13px; cursor:pointer; border:none; opacity:0.8;">
            Load More
        </button>
    </div>
</div>
```

- [ ] **Step 2: Add Trending JS functions**

```javascript
// ═══════ EXPLORE: TRENDING ═══════
let trendingPage = 1;
let trendingTotalCount = 0;

async function loadTrendingRepos(loadMore = false) {
    const token = await window.api.getToken();
    if (!token) { showToast('Please set your GitHub token first', 'error'); return; }

    const timeRange = document.getElementById('exploreTrendingTime').value;
    const lang = document.getElementById('exploreTrendingLang').value;
    const sort = document.getElementById('exploreTrendingSort').value;

    let dateFilter = '';
    const now = new Date();
    if (timeRange === 'weekly') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        dateFilter = ` created:>${weekAgo.toISOString().split('T')[0]}`;
    } else if (timeRange === 'monthly') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        dateFilter = ` created:>${monthAgo.toISOString().split('T')[0]}`;
    }

    const q = `stars:>50${dateFilter}`;

    if (!loadMore) {
        trendingPage = 1;
        const div = document.getElementById('exploreTrendingResults');
        div.innerHTML = '';
        const loading = document.createElement('div');
        loading.style.cssText = 'text-align:center; padding:40px; color:var(--text-secondary);';
        loading.textContent = 'Loading trending repos...';
        div.appendChild(loading);
    } else {
        trendingPage++;
    }

    const result = await window.api.searchRepos({ token, query: q, language: lang, sort, order: 'desc', page: trendingPage });

    const div = document.getElementById('exploreTrendingResults');
    if (!loadMore) div.innerHTML = '';

    if (result.error) { showToast('Failed to load trending', 'error'); return; }

    trendingTotalCount = result.total_count || 0;
    const items = result.items || [];

    items.forEach(repo => {
        div.appendChild(createExploreRepoCard(repo));
    });

    document.getElementById('exploreTrendingLoadMore').style.display =
        div.children.length < trendingTotalCount ? 'block' : 'none';
}
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(explore): add Trending view with time/language/sort filters"
```

---

## Task 5: Add Topics View HTML and JS

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add Topics view HTML**

```html
<!-- ═══════ EXPLORE: TOPICS ═══════ -->
<div class="view-section" id="view-exploreTopics" style="display:none; flex-direction:column; gap:16px;">
    <div id="exploreTopicsGrid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:10px;"></div>
    <div id="exploreTopicRepos" style="display:none; flex-direction:column; gap:8px;">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:4px;">
            <button onclick="backToTopics()" style="padding:4px 10px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-input); color:var(--text-primary); font-size:12px; cursor:pointer;">← Back</button>
            <span id="exploreTopicTitle" style="font-size:15px; font-weight:600; color:var(--text-primary);"></span>
        </div>
        <div id="exploreTopicReposList" style="display:flex; flex-direction:column; gap:8px;"></div>
        <div id="exploreTopicLoadMore" style="display:none; text-align:center;">
            <button onclick="loadTopicRepos(null, true)" class="btn-primary" style="padding:8px 24px; border-radius:6px; font-size:13px; cursor:pointer; border:none; opacity:0.8;">
                Load More
            </button>
        </div>
    </div>
</div>
```

- [ ] **Step 2: Add Topics JS functions**

```javascript
// ═══════ EXPLORE: TOPICS ═══════
const popularTopics = [
    'machine-learning', 'react', 'python', 'javascript', 'typescript',
    'nodejs', 'docker', 'kubernetes', 'rust', 'go', 'vue', 'angular',
    'nextjs', 'tailwindcss', 'cli', 'api', 'database', 'devops',
    'security', 'blockchain', 'flutter', 'android', 'ios', 'swift',
    'artificial-intelligence', 'deep-learning', 'data-science', 'web',
    'linux', 'game-development', 'graphql', 'testing'
];

let currentTopic = '';
let topicPage = 1;
let topicTotalCount = 0;

function loadTopics() {
    const grid = document.getElementById('exploreTopicsGrid');
    grid.innerHTML = '';
    document.getElementById('exploreTopicsGrid').style.display = 'grid';
    document.getElementById('exploreTopicRepos').style.display = 'none';

    popularTopics.forEach(topic => {
        const card = document.createElement('div');
        card.style.cssText = 'background:var(--bg-card); border:1px solid var(--border-color); border-radius:8px; padding:14px; text-align:center; cursor:pointer; transition:background 0.15s;';
        card.addEventListener('mouseenter', () => card.style.background = 'var(--bg-input)');
        card.addEventListener('mouseleave', () => card.style.background = 'var(--bg-card)');

        const label = document.createElement('div');
        label.style.cssText = 'font-size:13px; font-weight:600; color:var(--accent-blue);';
        label.textContent = '#' + topic;
        card.appendChild(label);

        card.addEventListener('click', () => loadTopicRepos(topic));
        grid.appendChild(card);
    });
}

async function loadTopicRepos(topic, loadMore = false) {
    const token = await window.api.getToken();
    if (!token) { showToast('Please set your GitHub token first', 'error'); return; }

    if (topic) {
        currentTopic = topic;
        topicPage = 1;
    } else if (loadMore) {
        topicPage++;
    }

    document.getElementById('exploreTopicsGrid').style.display = 'none';
    document.getElementById('exploreTopicRepos').style.display = 'flex';
    document.getElementById('exploreTopicTitle').textContent = '#' + currentTopic;

    const listDiv = document.getElementById('exploreTopicReposList');
    if (!loadMore) {
        listDiv.innerHTML = '';
        const loading = document.createElement('div');
        loading.style.cssText = 'text-align:center; padding:40px; color:var(--text-secondary);';
        loading.textContent = 'Loading...';
        listDiv.appendChild(loading);
    }

    const result = await window.api.searchRepos({
        token, query: `topic:${currentTopic} stars:>10`, sort: 'stars', order: 'desc', page: topicPage
    });

    if (!loadMore) listDiv.innerHTML = '';

    if (result.error) { showToast('Failed to load topic repos', 'error'); return; }

    topicTotalCount = result.total_count || 0;
    (result.items || []).forEach(repo => {
        listDiv.appendChild(createExploreRepoCard(repo));
    });

    document.getElementById('exploreTopicLoadMore').style.display =
        listDiv.children.length < topicTotalCount ? 'block' : 'none';
}

function backToTopics() {
    document.getElementById('exploreTopicsGrid').style.display = 'grid';
    document.getElementById('exploreTopicRepos').style.display = 'none';
}
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(explore): add Topics view with popular topics grid and repo listing"
```

---

## Task 6: Add Repo Detail Modal

**Files:**
- Modify: `index.html` (modal HTML + JS)

- [ ] **Step 1: Add modal HTML**

Add before `</body>`:

```html
<!-- ═══════ EXPLORE: REPO DETAIL MODAL ═══════ -->
<div id="exploreDetailModal" class="modal" style="display:none;">
    <div class="modal-content" style="max-width:700px; max-height:85vh; overflow-y:auto;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <h3 id="exploreDetailTitle" style="margin:0; font-size:18px; color:var(--accent-blue);"></h3>
            <button class="modal-close-btn" onclick="closeExploreDetailModal()">✕</button>
        </div>
        <div id="exploreDetailBody" style="display:flex; flex-direction:column; gap:16px;">
            <div style="text-align:center; padding:30px; color:var(--text-secondary);">Loading...</div>
        </div>
    </div>
</div>
```

- [ ] **Step 2: Add modal JS functions**

```javascript
// ═══════ EXPLORE: REPO DETAIL MODAL ═══════
async function openExploreDetailModal(fullName) {
    const modal = document.getElementById('exploreDetailModal');
    modal.style.display = 'flex';
    document.getElementById('exploreDetailTitle').textContent = fullName;
    const body = document.getElementById('exploreDetailBody');
    body.innerHTML = '';

    const loading = document.createElement('div');
    loading.style.cssText = 'text-align:center; padding:30px; color:var(--text-secondary);';
    loading.textContent = 'Loading repository details...';
    body.appendChild(loading);

    const token = await window.api.getToken();
    const data = await window.api.getExploreRepoDetail({ token, fullName });
    body.innerHTML = '';

    if (data.error) {
        const err = document.createElement('div');
        err.style.cssText = 'color:var(--danger); text-align:center; padding:20px;';
        err.textContent = 'Failed to load: ' + data.error;
        body.appendChild(err);
        return;
    }

    const repo = data.repo;
    if (!repo) return;

    // Stats row
    const stats = document.createElement('div');
    stats.style.cssText = 'display:flex; gap:16px; flex-wrap:wrap; font-size:13px; color:var(--text-secondary);';
    stats.innerHTML = '';
    ['⭐ ' + (repo.stargazers_count || 0).toLocaleString() + ' stars',
     '🍴 ' + (repo.forks_count || 0).toLocaleString() + ' forks',
     '👁️ ' + (repo.watchers_count || 0).toLocaleString() + ' watchers',
     '📏 ' + (repo.size ? (repo.size / 1024).toFixed(1) + ' MB' : 'N/A')
    ].forEach(text => {
        const s = document.createElement('span');
        s.textContent = text;
        stats.appendChild(s);
    });
    body.appendChild(stats);

    // Description
    if (repo.description) {
        const desc = document.createElement('div');
        desc.style.cssText = 'font-size:13px; color:var(--text-secondary); line-height:1.5;';
        desc.textContent = repo.description;
        body.appendChild(desc);
    }

    // Actions
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex; gap:8px; flex-wrap:wrap;';

    const starBtn = document.createElement('button');
    starBtn.style.cssText = 'padding:6px 14px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-input); color:var(--text-primary); font-size:13px; cursor:pointer;';
    starBtn.textContent = data.starred ? '⭐ Unstar' : '⭐ Star';
    starBtn.addEventListener('click', async () => {
        const t = await window.api.getToken();
        if (data.starred) {
            await window.api.unstarRepo({ token: t, fullName });
            starBtn.textContent = '⭐ Star';
            data.starred = false;
            showToast('Unstarred ' + fullName, 'success');
        } else {
            await window.api.starRepo({ token: t, fullName });
            starBtn.textContent = '⭐ Unstar';
            data.starred = true;
            showToast('Starred ' + fullName, 'success');
        }
    });
    actions.appendChild(starBtn);

    const forkBtn = document.createElement('button');
    forkBtn.style.cssText = 'padding:6px 14px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-input); color:var(--text-primary); font-size:13px; cursor:pointer;';
    forkBtn.textContent = '🍴 Fork';
    forkBtn.addEventListener('click', async () => {
        const t = await window.api.getToken();
        const res = await window.api.forkRepo({ token: t, fullName });
        if (res && !res.error) showToast('Forked successfully!', 'success');
        else showToast('Fork failed', 'error');
    });
    actions.appendChild(forkBtn);

    const cloneHttps = document.createElement('button');
    cloneHttps.style.cssText = 'padding:6px 14px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-input); color:var(--text-primary); font-size:13px; cursor:pointer;';
    cloneHttps.textContent = '📋 HTTPS';
    cloneHttps.addEventListener('click', () => {
        navigator.clipboard.writeText(repo.clone_url);
        showToast('HTTPS clone URL copied!', 'success');
    });
    actions.appendChild(cloneHttps);

    const cloneSsh = document.createElement('button');
    cloneSsh.style.cssText = 'padding:6px 14px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-input); color:var(--text-primary); font-size:13px; cursor:pointer;';
    cloneSsh.textContent = '📋 SSH';
    cloneSsh.addEventListener('click', () => {
        navigator.clipboard.writeText(repo.ssh_url);
        showToast('SSH clone URL copied!', 'success');
    });
    actions.appendChild(cloneSsh);

    const openGh = document.createElement('button');
    openGh.style.cssText = 'padding:6px 14px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-input); color:var(--text-primary); font-size:13px; cursor:pointer;';
    openGh.textContent = '🔗 Open on GitHub';
    openGh.addEventListener('click', () => window.api.openExternal(repo.html_url));
    actions.appendChild(openGh);

    body.appendChild(actions);

    // Language bar
    const langs = data.languages || {};
    const langKeys = Object.keys(langs);
    if (langKeys.length > 0) {
        const langSection = document.createElement('div');
        const langTitle = document.createElement('div');
        langTitle.style.cssText = 'font-size:12px; font-weight:600; color:var(--text-primary); margin-bottom:6px;';
        langTitle.textContent = 'Languages';
        langSection.appendChild(langTitle);

        const total = Object.values(langs).reduce((a, b) => a + b, 0);
        const langColors = {
            JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Java: '#b07219',
            Go: '#00ADD8', Rust: '#dea584', 'C++': '#f34b7d', 'C#': '#178600', PHP: '#4F5D95',
            Ruby: '#701516', Swift: '#F05138', Kotlin: '#A97BFF', Dart: '#00B4AB',
            Shell: '#89e051', HTML: '#e34c26', CSS: '#563d7c', Vue: '#41b883'
        };

        const bar = document.createElement('div');
        bar.style.cssText = 'display:flex; height:8px; border-radius:4px; overflow:hidden; margin-bottom:8px;';
        langKeys.forEach(l => {
            const seg = document.createElement('div');
            seg.style.cssText = `width:${(langs[l]/total*100).toFixed(1)}%; background:${langColors[l] || '#666'};`;
            seg.title = l + ' ' + (langs[l]/total*100).toFixed(1) + '%';
            bar.appendChild(seg);
        });
        langSection.appendChild(bar);

        const langList = document.createElement('div');
        langList.style.cssText = 'display:flex; gap:10px; flex-wrap:wrap; font-size:11px; color:var(--text-secondary);';
        langKeys.forEach(l => {
            const item = document.createElement('span');
            item.style.cssText = 'display:flex; align-items:center; gap:4px;';
            const dot = document.createElement('span');
            dot.style.cssText = `width:8px; height:8px; border-radius:50%; background:${langColors[l] || '#666'};`;
            item.appendChild(dot);
            const text = document.createElement('span');
            text.textContent = l + ' ' + (langs[l]/total*100).toFixed(1) + '%';
            item.appendChild(text);
            langList.appendChild(item);
        });
        langSection.appendChild(langList);
        body.appendChild(langSection);
    }

    // Recent commits
    const commits = data.commits || [];
    if (commits.length > 0) {
        const commitsSection = document.createElement('div');
        const commitsTitle = document.createElement('div');
        commitsTitle.style.cssText = 'font-size:12px; font-weight:600; color:var(--text-primary); margin-bottom:6px;';
        commitsTitle.textContent = 'Recent Commits';
        commitsSection.appendChild(commitsTitle);

        commits.forEach(c => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid var(--border-color); font-size:12px;';
            const sha = document.createElement('span');
            sha.style.cssText = 'font-family:monospace; color:var(--accent-blue); flex-shrink:0;';
            sha.textContent = (c.sha || '').substring(0, 7);
            const msg = document.createElement('span');
            msg.style.cssText = 'color:var(--text-primary); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
            msg.textContent = c.commit?.message?.split('\n')[0] || '';
            const date = document.createElement('span');
            date.style.cssText = 'color:var(--text-secondary); flex-shrink:0;';
            date.textContent = c.commit?.author?.date ? new Date(c.commit.author.date).toLocaleDateString() : '';
            row.appendChild(sha);
            row.appendChild(msg);
            row.appendChild(date);
            commitsSection.appendChild(row);
        });
        body.appendChild(commitsSection);
    }

    // README
    const readme = data.readme;
    if (readme && readme.content) {
        const readmeSection = document.createElement('div');
        const readmeTitle = document.createElement('div');
        readmeTitle.style.cssText = 'font-size:12px; font-weight:600; color:var(--text-primary); margin-bottom:6px;';
        readmeTitle.textContent = 'README';
        readmeSection.appendChild(readmeTitle);

        const readmeContent = document.createElement('div');
        readmeContent.style.cssText = 'background:var(--bg-input); border-radius:6px; padding:12px; font-size:12px; color:var(--text-secondary); line-height:1.6; max-height:300px; overflow-y:auto; white-space:pre-wrap; word-break:break-word;';
        try {
            readmeContent.textContent = atob(readme.content);
        } catch (e) {
            readmeContent.textContent = 'Unable to decode README';
        }
        readmeSection.appendChild(readmeContent);
        body.appendChild(readmeSection);
    }
}

function closeExploreDetailModal() {
    document.getElementById('exploreDetailModal').style.display = 'none';
}

// Close on backdrop click
document.getElementById('exploreDetailModal')?.addEventListener('click', function(e) {
    if (e.target === this) closeExploreDetailModal();
});
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(explore): add repo detail modal with README, languages, commits, actions"
```

---

## Task 7: Final Integration and Version Bump

**Files:**
- Modify: `package.json` (version bump to 2.3.0)
- Modify: `index.html` (footer version)

- [ ] **Step 1: Update version in package.json to 2.3.0**

- [ ] **Step 2: Update version footer in index.html**

Find the footer text `v2.2.0` and change to `v2.3.0`.

- [ ] **Step 3: Commit**

```bash
git add package.json index.html
git commit -m "feat: v2.3.0 — GitHub Explore with Search, Trending, Topics & repo detail"
```
