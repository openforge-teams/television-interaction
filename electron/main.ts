/**
 * Electron 主进程 - 窗口管理、IPC 处理
 * 对应文档第一、六、九章
 */
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { registerProjectHandlers } from './ipc/project';
import { registerAssetHandlers } from './ipc/asset';
import { registerPreviewHandlers } from './ipc/renpy';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: '影游工坊',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 开发模式加载 Vite dev server，生产模式加载打包后的文件
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // 注册 IPC 处理器
  registerProjectHandlers();
  registerAssetHandlers();
  registerPreviewHandlers();

  // 文件夹选择对话框
  ipcMain.handle('dialog:selectFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory', 'createDirectory'],
      title: '选择项目保存位置',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // 文件选择对话框（素材导入）
  ipcMain.handle('dialog:selectFiles', async (_event, filters: { name: string; extensions: string[] }[]) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile', 'multiSelections'],
      title: '选择素材文件',
      filters: filters || [
        { name: '图片', extensions: ['png', 'jpg', 'jpeg'] },
        { name: '视频', extensions: ['mp4', 'webm'] },
        { name: '音频', extensions: ['ogg', 'mp3', 'wav'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths;
  });

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

// 导出 mainWindow 供 IPC 模块使用
export function getMainWindow() {
  return mainWindow;
}
