const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // API to fetch repositories
    getRepos: (token) => ipcRenderer.invoke('getRepos', token),

    // API to show confirm dialog before deletion
    confirmDelete: (count) => ipcRenderer.invoke('confirmDelete', count),

    // API to perform delete
    deleteRepos: (data) => ipcRenderer.invoke('deleteRepos', data),

    // Token Management
    getToken: () => ipcRenderer.invoke('getToken'),
    saveToken: (token) => ipcRenderer.invoke('saveToken', token),

    // AI & Rename
    getRouterKey: () => ipcRenderer.invoke('getRouterKey'),
    saveRouterKey: (key) => ipcRenderer.invoke('saveRouterKey', key),
    analyzeReposAI: (data) => ipcRenderer.invoke('analyzeReposAI', data),
    executeRenames: (data) => ipcRenderer.invoke('executeRenames', data),

    // AI Description & README
    generateDescription: (data) => ipcRenderer.invoke('generateDescription', data),
    updateDescription: (data) => ipcRenderer.invoke('updateDescription', data),
    generateReadme: (data) => ipcRenderer.invoke('generateReadme', data),
    createReadmeInRepo: (data) => ipcRenderer.invoke('createReadmeInRepo', data),
    getRepoDetails: (data) => ipcRenderer.invoke('getRepoDetails', data),

    // Detailed Repo Info & Fork Sync
    getDetailedRepoInfo: (data) => ipcRenderer.invoke('getDetailedRepoInfo', data),
    syncFork: (data) => ipcRenderer.invoke('syncFork', data),

    // Repo Organization (Visibility, Topics, License)
    changeVisibility: (data) => ipcRenderer.invoke('changeVisibility', data),
    updateTopics: (data) => ipcRenderer.invoke('updateTopics', data),
    getRepoTopics: (data) => ipcRenderer.invoke('getRepoTopics', data),
    addLicense: (data) => ipcRenderer.invoke('addLicense', data),
    checkLicense: (data) => ipcRenderer.invoke('checkLicense', data),

    // Analysis & Cleanup
    analyzeAllRepos: (data) => ipcRenderer.invoke('analyzeAllRepos', data),
    checkForkChanges: (data) => ipcRenderer.invoke('checkForkChanges', data),

    // Window Controls
    minimize: () => ipcRenderer.send('app:minimize'),
    maximize: () => ipcRenderer.send('app:maximize'),
    close: () => ipcRenderer.send('app:close'),

    // External Links
    openExternal: (url) => ipcRenderer.send('open-external', url)
});
