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
    executeRenames: (data) => ipcRenderer.invoke('executeRenames', data)
});
