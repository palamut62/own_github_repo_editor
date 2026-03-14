# GitHub Explore Feature — Design Spec

## Overview
Add a "Discovery" category to the sidebar with Search, Trending, and Topics pages for exploring GitHub repositories. Users can search, browse trending repos, explore by topic, and perform star/fork/clone actions with a detailed repo modal.

## Sidebar
- New collapsible **"Discovery"** category with 3 buttons: Search, Trending, Topics
- Follows existing collapsible category pattern (`.nav-category` / `.nav-category-body`)

## Search Page
- Search input for repo name/description
- Filters: Language dropdown, min stars, sort by (stars/forks/updated)
- Results list: repo name, description, language, star/fork count, last updated
- Each row: Star, Fork, Clone URL copy buttons
- Click repo name → detail modal

## Trending Page
- Time filter: This week / This month / All time
- Language filter dropdown
- Sort toggle: Stars / Forks
- Same list format and actions as Search

## Topics Page
- Grid of popular topics (machine-learning, react, python, cli, etc.)
- Click topic → list of top repos for that topic
- Same filters and actions

## Repo Detail Modal
- README.md rendered (markdown → HTML, sanitized)
- Language distribution (colored bar)
- Last 5 commits (message, author, date)
- Star / Fork / Watcher counts
- Star and Fork action buttons
- Clone URL (HTTPS + SSH)

## API Endpoints
| Action | Method | Endpoint |
|--------|--------|----------|
| Search repos | GET | `/search/repositories?q=...&sort=stars&order=desc` |
| Star repo | PUT | `/user/starred/{owner}/{repo}` |
| Unstar repo | DELETE | `/user/starred/{owner}/{repo}` |
| Fork repo | POST | `/repos/{owner}/{repo}/forks` |
| Get README | GET | `/repos/{owner}/{repo}/readme` |
| Get languages | GET | `/repos/{owner}/{repo}/languages` |
| Get commits | GET | `/repos/{owner}/{repo}/commits?per_page=5` |
| Search topics | GET | `/search/topics` |
| Check starred | GET | `/user/starred/{owner}/{repo}` (204=yes, 404=no) |

## Pagination
- 30 repos per page, "Load More" button

## Files to Modify
- `index.html` — sidebar category, 3 page views, detail modal, CSS, JS functions
- `main.js` — IPC handlers for all GitHub API calls
- `preload.js` — IPC bindings

## Security
- README rendered with DOMPurify or safe DOM API (no innerHTML with raw content)
- All API calls through main process IPC (no direct renderer fetch)
