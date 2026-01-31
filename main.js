const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const https = require('https');
const fs = require('fs');

let mainWindow;
let currentUser = null; // To cache user info

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 750,
        frame: false, // Custom Title Bar
        titleBarStyle: 'hidden',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Helper for HTTP requests
function githubRequest(path, method, token, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: path,
            method: method,
            headers: {
                'User-Agent': 'GitHub-Repo-Cleaner',
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(data ? JSON.parse(data) : null);
                    } catch (e) {
                        resolve(null); // No content (204)
                    }
                } else {
                    reject(new Error(`GitHub API Error: ${res.statusCode} - ${data}`));
                }
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

// 1. Get Repos Handler
ipcMain.handle('getRepos', async (event, token) => {
    try {
        // First, verify/cache user info to know who we are acting as
        if (!currentUser) {
            currentUser = await githubRequest('/user', 'GET', token);
        }

        let allRepos = [];
        let page = 1;
        let hasMore = true;

        // Fetch all pages (100 per page)
        while (hasMore) {
            const repos = await githubRequest(`/user/repos?per_page=100&page=${page}&sort=updated`, 'GET', token);
            if (repos && repos.length > 0) {
                allRepos = allRepos.concat(repos);
                if (repos.length < 100) hasMore = false;
                page++;
            } else {
                hasMore = false;
            }
        }

        return { success: true, data: allRepos };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// 2. Confirm Delete Handler
ipcMain.handle('confirmDelete', async (event, count) => {
    const result = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        buttons: ['İptal', 'SİL'],
        defaultId: 0,
        title: 'Onay Gerekli',
        message: `${count} adet repository seçtiniz.`,
        detail: `Bu işlem geri alınamaz! Seçilen ${count} repoyu gerçekten silmek istiyor musunuz?`,
        cancelId: 0,
    });
    return result.response === 1; // 1 = SİL butonuna tıklandıysa true
});

// 3. Delete Repos Handler
ipcMain.handle('deleteRepos', async (event, { token, repos }) => {
    const results = [];

    for (const repoFullName of repos) {
        try {
            // DELETE /repos/:owner/:repo
            // repoFullName is already "owner/repo"
            await githubRequest(`/repos/${repoFullName}`, 'DELETE', token);
            results.push({ name: repoFullName, status: 'Silindi' });
        } catch (error) {
            results.push({ name: repoFullName, status: `Hata: ${error.message}` });
        }
    }
    return results;
});

// 4. Token Management handlers
ipcMain.handle('getToken', async () => {
    try {
        const envPath = path.join(__dirname, '.env');
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf-8');
            const match = content.match(/GITHUB_TOKEN=(.+)/);
            return match ? match[1].trim() : '';
        }
        return '';
    } catch (e) {
        console.error('Token read error:', e);
        return '';
    }
});

// ... existing token handlers ...

ipcMain.handle('saveToken', async (event, token) => {
    try {
        const envPath = path.join(__dirname, '.env');
        let content = '';
        if (fs.existsSync(envPath)) {
            content = fs.readFileSync(envPath, 'utf-8');
        }
        // Replace or Append
        if (content.includes('GITHUB_TOKEN=')) {
            content = content.replace(/GITHUB_TOKEN=.*/, `GITHUB_TOKEN=${token}`);
        } else {
            content += `\nGITHUB_TOKEN=${token}`;
        }
        fs.writeFileSync(envPath, content.trim());
        return true;
    } catch (e) {
        console.error('Token save error:', e);
        return false;
    }
});

// 5. Router Key Management
ipcMain.handle('getRouterKey', async () => {
    try {
        const envPath = path.join(__dirname, '.env');
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf-8');
            const match = content.match(/ROUTER_KEY=(.+)/);
            return match ? match[1].trim() : '';
        }
        return '';
    } catch (e) {
        return '';
    }
});

ipcMain.handle('saveRouterKey', async (event, key) => {
    try {
        const envPath = path.join(__dirname, '.env');
        let content = '';
        if (fs.existsSync(envPath)) {
            content = fs.readFileSync(envPath, 'utf-8');
        }
        if (content.includes('ROUTER_KEY=')) {
            content = content.replace(/ROUTER_KEY=.*/, `ROUTER_KEY=${key}`);
        } else {
            content += `\nROUTER_KEY=${key}`;
        }
        fs.writeFileSync(envPath, content.trim());
        return true;
    } catch (e) {
        return false;
    }
});

// 6. AI & Rename Logic Helpers
async function getReadmeContent(token, owner, repo) {
    try {
        const data = await githubRequest(`/repos/${owner}/${repo}/readme`, 'GET', token);
        if (data && data.content) {
            return Buffer.from(data.content, 'base64').toString('utf-8');
        }
        return null;
    } catch (e) {
        return null; // No readme
    }
}

function openRouterRequest(apiKey, readmeContent) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            model: "moonshotai/kimi-k2.5",
            messages: [
                {
                    "role": "system",
                    "content": "You are a helpful assistant that suggests repository names usually in kebab-case based on README content. Output ONLY the suggested name, nothing else."
                },
                {
                    "role": "user",
                    "content": `Analyze this README and suggest a concise, kebab-case (or snake_case if appropriate) repository name. Content:\n\n${readmeContent.substring(0, 3000)}`
                }
            ]
        });

        const req = https.request({
            hostname: 'openrouter.ai',
            path: '/api/v1/chat/completions',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData) // Important for some APIs
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const json = JSON.parse(data);
                        resolve(json.choices[0].message.content.trim());
                    } catch (e) {
                        resolve(null);
                    }
                } else {
                    console.error('OpenRouter Error:', data);
                    resolve(null);
                }
            });
        });

        req.on('error', (e) => resolve(null));
        req.write(postData);
        req.end();
    });
}

ipcMain.handle('analyzeReposAI', async (event, { token, routerKey, repos }) => {
    const results = [];

    for (const fullName of repos) { // repos is array of "owner/repo" strings
        const [owner, repoName] = fullName.split('/');

        // 1. Get Readme
        const readme = await getReadmeContent(token, owner, repoName);

        let proposedName = '';
        if (readme) {
            // 2. Ask AI
            proposedName = await openRouterRequest(routerKey, readme);
        }

        // Fallback or Clean up
        if (!proposedName) proposedName = repoName;

        // Clean potential garbage (AI sometimes adds quotes or explanation)
        proposedName = proposedName.replace(/["`]/g, '').split('\n')[0].trim();

        results.push({
            original: fullName,
            currentName: repoName,
            proposed: proposedName
        });
    }
    return results;
});

ipcMain.handle('executeRenames', async (event, { token, renames }) => {
    // renames = [{ owner, repo, newName }, ...]
    const results = [];

    for (const item of renames) {
        try {
            await githubRequest(`/repos/${item.owner}/${item.repo}`, 'PATCH', token, {
                name: item.newName
            });
            results.push({ name: `${item.owner}/${item.repo}`, status: 'Success' });
        } catch (e) {
            results.push({ name: `${item.owner}/${item.repo}`, status: `Error: ${e.message}` });
        }
    }
    return results;
});


// Window Controls
ipcMain.on('app:minimize', () => {
    mainWindow.minimize();
});

ipcMain.on('app:maximize', () => {
    if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow.maximize();
    }
});

ipcMain.on('app:close', () => {
    mainWindow.close();
});

ipcMain.on('open-external', (event, url) => {
    require('electron').shell.openExternal(url);
});

// 7. AI Description Generator
function openRouterDescriptionRequest(apiKey, readmeContent) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            model: "moonshotai/kimi-k2.5",
            messages: [
                {
                    "role": "system",
                    "content": "You are a helpful assistant that creates short, professional GitHub repository descriptions. Output ONLY the description text (max 100 characters), nothing else. No quotes, no explanations."
                },
                {
                    "role": "user",
                    "content": `Create a short, professional GitHub description for this repository based on the README:\n\n${readmeContent.substring(0, 3000)}`
                }
            ]
        });

        const req = https.request({
            hostname: 'openrouter.ai',
            path: '/api/v1/chat/completions',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const json = JSON.parse(data);
                        resolve(json.choices[0].message.content.trim());
                    } catch (e) {
                        resolve(null);
                    }
                } else {
                    resolve(null);
                }
            });
        });

        req.on('error', () => resolve(null));
        req.write(postData);
        req.end();
    });
}

ipcMain.handle('generateDescription', async (event, { token, routerKey, repos }) => {
    const results = [];

    for (const fullName of repos) {
        const [owner, repoName] = fullName.split('/');
        const readme = await getReadmeContent(token, owner, repoName);

        let description = '';
        if (readme) {
            description = await openRouterDescriptionRequest(routerKey, readme);
        }

        if (!description) description = 'No description available.';
        description = description.replace(/[\"`]/g, '').split('\n')[0].trim().substring(0, 100);

        results.push({
            fullName,
            repoName,
            description
        });
    }
    return results;
});

// 8. Update Repository Description
ipcMain.handle('updateDescription', async (event, { token, owner, repo, description }) => {
    try {
        await githubRequest(`/repos/${owner}/${repo}`, 'PATCH', token, { description });
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// 9. AI README Generator
function openRouterReadmeRequest(apiKey, repoName, files) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            model: "moonshotai/kimi-k2.5",
            messages: [
                {
                    "role": "system",
                    "content": "You are a helpful assistant that creates professional README.md files for GitHub repositories. Output ONLY the markdown content, no explanations."
                },
                {
                    "role": "user",
                    "content": `Create a professional README.md for a repository named "${repoName}" with these files:\n${files.join(', ')}\n\nInclude: Title, Description, Installation, Usage, Technologies, and License sections.`
                }
            ]
        });

        const req = https.request({
            hostname: 'openrouter.ai',
            path: '/api/v1/chat/completions',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const json = JSON.parse(data);
                        resolve(json.choices[0].message.content.trim());
                    } catch (e) {
                        resolve(null);
                    }
                } else {
                    resolve(null);
                }
            });
        });

        req.on('error', () => resolve(null));
        req.write(postData);
        req.end();
    });
}

async function getRepoFiles(token, owner, repo) {
    try {
        const data = await githubRequest(`/repos/${owner}/${repo}/contents`, 'GET', token);
        if (data && Array.isArray(data)) {
            return data.map(f => f.name);
        }
        return [];
    } catch (e) {
        return [];
    }
}

ipcMain.handle('generateReadme', async (event, { token, routerKey, fullName }) => {
    const [owner, repoName] = fullName.split('/');
    const files = await getRepoFiles(token, owner, repoName);

    if (files.length === 0) {
        return { success: false, readme: null, error: 'No files found in repository.' };
    }

    const readme = await openRouterReadmeRequest(routerKey, repoName, files);

    if (!readme) {
        return { success: false, readme: null, error: 'AI could not generate README.' };
    }

    return { success: true, readme, files };
});

// 10. Get Repository Details (for clone URL and setup info)
ipcMain.handle('getRepoDetails', async (event, { token, fullName }) => {
    try {
        const [owner, repo] = fullName.split('/');
        const data = await githubRequest(`/repos/${owner}/${repo}`, 'GET', token);
        return {
            success: true,
            data: {
                name: data.name,
                fullName: data.full_name,
                description: data.description,
                cloneUrl: data.clone_url,
                sshUrl: data.ssh_url,
                htmlUrl: data.html_url,
                defaultBranch: data.default_branch,
                language: data.language,
                private: data.private
            }
        };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// 11. Create/Update README file in repository
ipcMain.handle('createReadmeInRepo', async (event, { token, fullName, content }) => {
    const [owner, repo] = fullName.split('/');

    try {
        // Check if README exists
        let sha = null;
        try {
            const existing = await githubRequest(`/repos/${owner}/${repo}/contents/README.md`, 'GET', token);
            sha = existing.sha;
        } catch (e) {
            // README doesn't exist, that's fine
        }

        const body = {
            message: sha ? 'Update README.md via GitHub Repo Editor' : 'Create README.md via GitHub Repo Editor',
            content: Buffer.from(content).toString('base64')
        };

        if (sha) body.sha = sha;

        await githubRequest(`/repos/${owner}/${repo}/contents/README.md`, 'PUT', token, body);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// 12. Get Detailed Repository Info (for double-click modal)
ipcMain.handle('getDetailedRepoInfo', async (event, { token, fullName }) => {
    try {
        const [owner, repo] = fullName.split('/');
        const data = await githubRequest(`/repos/${owner}/${repo}`, 'GET', token);

        // Get languages
        let languages = {};
        try {
            languages = await githubRequest(`/repos/${owner}/${repo}/languages`, 'GET', token);
        } catch (e) {
            // ignore
        }

        // Get recent commits
        let recentCommits = [];
        try {
            const commits = await githubRequest(`/repos/${owner}/${repo}/commits?per_page=5`, 'GET', token);
            recentCommits = commits.map(c => ({
                sha: c.sha.substring(0, 7),
                message: c.commit.message.split('\n')[0].substring(0, 50),
                date: c.commit.author.date,
                author: c.commit.author.name
            }));
        } catch (e) {
            // ignore
        }

        // Get parent info if fork
        let parentInfo = null;
        if (data.fork && data.parent) {
            parentInfo = {
                fullName: data.parent.full_name,
                htmlUrl: data.parent.html_url,
                defaultBranch: data.parent.default_branch,
                updatedAt: data.parent.updated_at
            };
        }

        // Check if fork is behind parent
        let syncStatus = null;
        if (data.fork && data.parent) {
            try {
                const comparison = await githubRequest(
                    `/repos/${owner}/${repo}/compare/${data.default_branch}...${data.parent.owner.login}:${data.parent.default_branch}`,
                    'GET',
                    token
                );
                syncStatus = {
                    behind: comparison.behind_by,
                    ahead: comparison.ahead_by,
                    status: comparison.status
                };
            } catch (e) {
                // Comparison might fail
            }
        }

        return {
            success: true,
            data: {
                name: data.name,
                fullName: data.full_name,
                description: data.description,
                cloneUrl: data.clone_url,
                sshUrl: data.ssh_url,
                htmlUrl: data.html_url,
                defaultBranch: data.default_branch,
                language: data.language,
                languages: languages,
                private: data.private,
                fork: data.fork,
                stargazersCount: data.stargazers_count,
                forksCount: data.forks_count,
                watchersCount: data.watchers_count,
                openIssuesCount: data.open_issues_count,
                createdAt: data.created_at,
                updatedAt: data.updated_at,
                pushedAt: data.pushed_at,
                size: data.size,
                topics: data.topics || [],
                parentInfo: parentInfo,
                syncStatus: syncStatus,
                recentCommits: recentCommits
            }
        };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// 13. Sync Fork with Upstream (Parent)
ipcMain.handle('syncFork', async (event, { token, fullName }) => {
    try {
        const [owner, repo] = fullName.split('/');

        // Use GitHub's merge-upstream API
        const result = await githubRequest(
            `/repos/${owner}/${repo}/merge-upstream`,
            'POST',
            token,
            { branch: 'main' } // Try main first
        );

        return { success: true, message: result.message || 'Fork synced successfully!' };
    } catch (e) {
        // Try with master branch if main fails
        try {
            const [owner, repo] = fullName.split('/');
            const result = await githubRequest(
                `/repos/${owner}/${repo}/merge-upstream`,
                'POST',
                token,
                { branch: 'master' }
            );
            return { success: true, message: result.message || 'Fork synced successfully!' };
        } catch (e2) {
            return { success: false, error: e2.message };
        }
    }
});

// 14. Change Repository Visibility (Public/Private)
ipcMain.handle('changeVisibility', async (event, { token, repos, visibility }) => {
    const results = [];

    for (const fullName of repos) {
        const [owner, repo] = fullName.split('/');
        try {
            await githubRequest(`/repos/${owner}/${repo}`, 'PATCH', token, {
                private: visibility === 'private'
            });
            results.push({ name: fullName, status: 'success' });
        } catch (e) {
            results.push({ name: fullName, status: 'error', error: e.message });
        }
    }

    return results;
});

// 15. Update Repository Topics
ipcMain.handle('updateTopics', async (event, { token, repos, topics, action }) => {
    const results = [];

    for (const fullName of repos) {
        const [owner, repo] = fullName.split('/');
        try {
            // Get current topics first
            const repoData = await githubRequest(`/repos/${owner}/${repo}`, 'GET', token);
            let currentTopics = repoData.topics || [];

            let newTopics;
            if (action === 'add') {
                // Add new topics without duplicates
                newTopics = [...new Set([...currentTopics, ...topics])];
            } else if (action === 'remove') {
                // Remove specified topics
                newTopics = currentTopics.filter(t => !topics.includes(t));
            } else if (action === 'replace') {
                // Replace all topics
                newTopics = topics;
            }

            // Update topics using the correct endpoint
            await githubRequest(`/repos/${owner}/${repo}/topics`, 'PUT', token, {
                names: newTopics
            });

            results.push({ name: fullName, status: 'success', topics: newTopics });
        } catch (e) {
            results.push({ name: fullName, status: 'error', error: e.message });
        }
    }

    return results;
});

// 16. Get Repository Topics
ipcMain.handle('getRepoTopics', async (event, { token, fullName }) => {
    try {
        const [owner, repo] = fullName.split('/');
        const data = await githubRequest(`/repos/${owner}/${repo}/topics`, 'GET', token);
        return { success: true, topics: data.names || [] };
    } catch (e) {
        return { success: false, error: e.message, topics: [] };
    }
});

// 17. Add License File to Repository
const LICENSE_TEMPLATES = {
    'MIT': `MIT License

Copyright (c) [year] [fullname]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`,

    'Apache-2.0': `                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.`,

    'GPL-3.0': `                    GNU GENERAL PUBLIC LICENSE
                       Version 3, 29 June 2007

 Copyright (C) 2007 Free Software Foundation, Inc. <https://fsf.org/>
 Everyone is permitted to copy and distribute verbatim copies
 of this license document, but changing it is not allowed.

                            Preamble

  The GNU General Public License is a free, copyleft license for
software and other kinds of works.

[Full GPL-3.0 text available at https://www.gnu.org/licenses/gpl-3.0.txt]`,

    'ISC': `ISC License

Copyright (c) [year] [fullname]

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.`
};

ipcMain.handle('addLicense', async (event, { token, repos, licenseType, authorName }) => {
    const results = [];
    const year = new Date().getFullYear();

    let licenseContent = LICENSE_TEMPLATES[licenseType] || LICENSE_TEMPLATES['MIT'];
    licenseContent = licenseContent.replace('[year]', year).replace('[fullname]', authorName || 'Author');

    for (const fullName of repos) {
        const [owner, repo] = fullName.split('/');

        try {
            // Check if LICENSE already exists
            let sha = null;
            try {
                const existing = await githubRequest(`/repos/${owner}/${repo}/contents/LICENSE`, 'GET', token);
                sha = existing.sha;
            } catch (e) {
                // LICENSE doesn't exist, that's fine
            }

            const body = {
                message: sha ? `Update LICENSE to ${licenseType}` : `Add ${licenseType} LICENSE`,
                content: Buffer.from(licenseContent).toString('base64')
            };

            if (sha) body.sha = sha;

            await githubRequest(`/repos/${owner}/${repo}/contents/LICENSE`, 'PUT', token, body);
            results.push({ name: fullName, status: 'success' });
        } catch (e) {
            results.push({ name: fullName, status: 'error', error: e.message });
        }
    }

    return results;
});

// 18. Check if repos have LICENSE
ipcMain.handle('checkLicense', async (event, { token, repos }) => {
    const results = [];

    for (const fullName of repos) {
        const [owner, repo] = fullName.split('/');
        try {
            await githubRequest(`/repos/${owner}/${repo}/contents/LICENSE`, 'GET', token);
            results.push({ name: fullName, hasLicense: true });
        } catch (e) {
            results.push({ name: fullName, hasLicense: false });
        }
    }

    return results;
});

// 19. Analyze All Repos (Stale, Size, Unchanged Forks)
ipcMain.handle('analyzeAllRepos', async (event, { token }) => {
    try {
        // First, verify/cache user info
        if (!currentUser) {
            currentUser = await githubRequest('/user', 'GET', token);
        }

        let allRepos = [];
        let page = 1;
        let hasMore = true;

        // Fetch all pages
        while (hasMore) {
            const repos = await githubRequest(`/user/repos?per_page=100&page=${page}&sort=updated`, 'GET', token);
            if (repos && repos.length > 0) {
                allRepos = allRepos.concat(repos);
                page++;
            } else {
                hasMore = false;
            }
        }

        const now = new Date();
        const sixMonthsAgo = new Date(now.getTime() - (180 * 24 * 60 * 60 * 1000));

        const analysis = {
            totalRepos: allRepos.length,
            totalSize: 0,
            staleRepos: [],
            largeRepos: [],
            unchangedForks: [],
            noStarsRepos: [],
            sizeByLanguage: {}
        };

        for (const repo of allRepos) {
            const updatedAt = new Date(repo.updated_at);
            const pushedAt = new Date(repo.pushed_at);

            // Total size
            analysis.totalSize += repo.size || 0;

            // Size by language
            if (repo.language) {
                if (!analysis.sizeByLanguage[repo.language]) {
                    analysis.sizeByLanguage[repo.language] = 0;
                }
                analysis.sizeByLanguage[repo.language] += repo.size || 0;
            }

            // Stale repos (not updated in 6 months)
            if (pushedAt < sixMonthsAgo) {
                analysis.staleRepos.push({
                    name: repo.name,
                    fullName: repo.full_name,
                    lastPush: repo.pushed_at,
                    lastUpdate: repo.updated_at,
                    stars: repo.stargazers_count,
                    size: repo.size
                });
            }

            // No stars repos
            if (repo.stargazers_count === 0 && !repo.fork) {
                analysis.noStarsRepos.push({
                    name: repo.name,
                    fullName: repo.full_name,
                    lastPush: repo.pushed_at,
                    size: repo.size
                });
            }

            // Large repos (over 50MB)
            if (repo.size > 50000) {
                analysis.largeRepos.push({
                    name: repo.name,
                    fullName: repo.full_name,
                    size: repo.size,
                    sizeFormatted: formatSize(repo.size)
                });
            }

            // Unchanged forks
            if (repo.fork) {
                analysis.unchangedForks.push({
                    name: repo.name,
                    fullName: repo.full_name,
                    lastPush: repo.pushed_at,
                    size: repo.size,
                    stars: repo.stargazers_count
                });
            }
        }

        // Sort large repos by size
        analysis.largeRepos.sort((a, b) => b.size - a.size);

        // Sort stale repos by last push date
        analysis.staleRepos.sort((a, b) => new Date(a.lastPush) - new Date(b.lastPush));

        return { success: true, analysis };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

function formatSize(sizeKB) {
    if (sizeKB < 1024) return `${sizeKB} KB`;
    if (sizeKB < 1024 * 1024) return `${(sizeKB / 1024).toFixed(1)} MB`;
    return `${(sizeKB / (1024 * 1024)).toFixed(2)} GB`;
}

// 20. Check if Fork has changes compared to parent
ipcMain.handle('checkForkChanges', async (event, { token, fullName }) => {
    try {
        const [owner, repo] = fullName.split('/');

        // Get repo data to find parent
        const repoData = await githubRequest(`/repos/${owner}/${repo}`, 'GET', token);

        if (!repoData.fork || !repoData.parent) {
            return { success: false, error: 'Not a fork or parent not accessible' };
        }

        // Compare with parent
        try {
            const comparison = await githubRequest(
                `/repos/${owner}/${repo}/compare/${repoData.parent.owner.login}:${repoData.parent.default_branch}...${repoData.default_branch}`,
                'GET',
                token
            );

            return {
                success: true,
                data: {
                    hasChanges: comparison.ahead_by > 0,
                    aheadBy: comparison.ahead_by,
                    behindBy: comparison.behind_by,
                    totalCommits: comparison.total_commits,
                    parentFullName: repoData.parent.full_name
                }
            };
        } catch (e) {
            // If comparison fails, assume no changes or inaccessible
            return { success: true, data: { hasChanges: false, aheadBy: 0, behindBy: 0, totalCommits: 0 } };
        }
    } catch (e) {
        return { success: false, error: e.message };
    }
});
