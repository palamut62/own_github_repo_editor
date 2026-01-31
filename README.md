# GitHub Repo Manager & Cleaner

A powerful Electron desktop application designed to help you manage, clean up, and intelligently organize your GitHub repositories using AI.

![App Screenshot](screenshoot.png)

## Features

### Core Features
- **Repository Listing:** View all your GitHub repositories with Source/Fork distinction
- **Filtering & Sorting:** Filter by Source/Fork and sort by update date
- **Search:** Quick search to find repositories by name
- **Dual View Modes:** Switch between List and Grid views
- **License Status Display:** Instantly see if a repo has an MIT license, another license, or no license
- **Bulk Selection:** Select all repositories on the current page with a single click
- **Bulk Deletion:** Select and delete multiple repositories at once

### AI-Powered Features (Requires OpenRouter API Key)
- **AI Smart Rename:** Analyzes README.md content and suggests appropriate repository names
- **AI Description Generator:** Creates professional descriptions based on README content
- **AI README Creator:** Generates complete README.md files by analyzing repository structure

### Organization Tools
- **Visibility Control:** Change repositories between Public and Private
- **Topics Manager:** Add or remove topics for better discoverability
- **License Manager:** Add MIT, Apache 2.0, GPL-3.0, or ISC license files
- **Setup/Clone Info:** Quick access to clone URLs (HTTPS & SSH) with one-click copy

### Repository Analysis
- **Stale Repos:** Identify repositories not updated in 6+ months
- **Large Repos:** Find repositories over 50MB
- **Unchanged Forks:** Detect forks without modifications
- **No Stars Repos:** List repositories without any stars

### Fork Management
- **Sync Status:** See if your fork is behind the upstream repository
- **One-Click Sync:** Update your fork with latest changes from parent repository
- **Parent Info:** Quick access to parent repository details

### Repository Details
- Double-click any repository to see detailed information:
  - Stats (Stars, Forks, Watchers, Issues)
  - Language breakdown with percentages
  - Recent commits
  - Clone URLs with copy buttons
  - Quick setup commands

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/github-repo-manager.git
   cd github-repo-manager
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

Start the application:
```bash
npm start
```

### Initial Setup
1. Click **Settings** in the sidebar
2. Enter your **GitHub Token** (requires `repo` and `delete_repo` scopes)
3. Enter your **OpenRouter API Key** for AI features
4. Click Save

### Getting a GitHub Token
1. Go to GitHub Settings > Developer settings > Personal access tokens
2. Generate a new token with `repo` and `delete_repo` scopes
3. Copy and paste the token into the app

### Getting an OpenRouter API Key
1. Visit [OpenRouter](https://openrouter.ai/)
2. Create an account and generate an API key
3. Copy and paste the key into the app

## Warnings

- **Deleting Repositories:** Deleted repositories **cannot** be restored. Use with caution.
- **Renaming Repositories:** Changes the remote URL. Update local projects with:
  ```bash
  git remote set-url origin NEW_URL
  ```
- **Visibility Changes:** Making repos private may require a paid GitHub plan.

## Technologies

- Electron.js
- Node.js
- OpenRouter API (Moonshot AI / Kimi K2.5)
- GitHub REST API

## Keyboard Shortcuts

- **Ctrl/Cmd + F:** Focus search
- **Esc:** Close modals

---
*Developer: Umut*
