"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Electron Preload 脚本 - 暴露安全的 IPC API 给渲染进程
 */
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    // 项目文件操作
    saveProject: (data, path) => electron_1.ipcRenderer.invoke('project:save', data, path),
    loadProject: (path) => electron_1.ipcRenderer.invoke('project:load', path),
    // 文件夹选择
    selectFolder: () => electron_1.ipcRenderer.invoke('dialog:selectFolder'),
    // 素材导入
    importAssets: (projectPath, filePaths) => electron_1.ipcRenderer.invoke('assets:import', projectPath, filePaths),
    // 导出 Ren'Py 工程
    exportProject: (data, scriptRpy, optionsRpy, variablesRpy, screensRpy, exportDir) => electron_1.ipcRenderer.invoke('project:export', data, scriptRpy, optionsRpy, variablesRpy, screensRpy, exportDir),
    // 预览
    startPreview: (data, scriptRpy, optionsRpy, variablesRpy, screensRpy, fromSceneId) => electron_1.ipcRenderer.invoke('preview:start', data, scriptRpy, optionsRpy, variablesRpy, screensRpy, fromSceneId),
    // 素材文件夹监听
    onAssetWatcher: (callback) => {
        electron_1.ipcRenderer.on('asset-watcher', (_event, eventType, path) => callback(eventType, path));
    },
});
//# sourceMappingURL=preload.js.map