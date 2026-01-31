const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const https = require('https');
const fs = require('fs');

let mainWindow;
let currentUser = null; // To cache user info

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 900,
        height: 700,
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
