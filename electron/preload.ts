/**
 * Electron Preload 脚本 - 暴露安全的 IPC API 给渲染进程
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // 项目文件操作
  saveProject: (data: any, path: string) => ipcRenderer.invoke('project:save', data, path),
  loadProject: (path: string) => ipcRenderer.invoke('project:load', path),

  // 文件夹选择
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),

  // 素材导入
  importAssets: (projectPath: string, filePaths: string[]) =>
    ipcRenderer.invoke('assets:import', projectPath, filePaths),

  // 导出 Ren'Py 工程
  exportProject: (
    data: any,
    scriptRpy: string,
    optionsRpy: string,
    variablesRpy: string,
    screensRpy: string,
    exportDir: string
  ) =>
    ipcRenderer.invoke(
      'project:export',
      data,
      scriptRpy,
      optionsRpy,
      variablesRpy,
      screensRpy,
      exportDir
    ),

  // 预览
  startPreview: (
    data: any,
    scriptRpy: string,
    optionsRpy: string,
    variablesRpy: string,
    screensRpy: string,
    fromSceneId?: string
  ) =>
    ipcRenderer.invoke(
      'preview:start',
      data,
      scriptRpy,
      optionsRpy,
      variablesRpy,
      screensRpy,
      fromSceneId
    ),

  // 素材文件夹监听
  onAssetWatcher: (callback: (event: string, path: string) => void) => {
    ipcRenderer.on('asset-watcher', (_event, eventType, path) => callback(eventType, path));
  },
});
