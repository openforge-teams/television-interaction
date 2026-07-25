/**
 * 文件服务 - 封装文件系统操作（Electron IPC 或浏览器降级）
 * 在浏览器环境中使用 localStorage 降级
 */
import type { ProjectData } from '@/types';

// 检测是否在 Electron 环境中
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

// 最近项目存储 key
const RECENT_PROJECTS_KEY = 'yingyou_recent_projects';

export interface RecentProject {
  name: string;
  path: string;
  lastModified: string;
  thumbnail?: string;
}

/**
 * 获取最近项目列表
 */
export function getRecentProjects(): RecentProject[] {
  try {
    const raw = localStorage.getItem(RECENT_PROJECTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentProject[];
  } catch {
    return [];
  }
}

/**
 * 添加/更新最近项目
 */
export function addRecentProject(project: RecentProject): void {
  const list = getRecentProjects().filter((p) => p.path !== project.path);
  list.unshift(project);
  // 最多 10 个
  const trimmed = list.slice(0, 10);
  localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(trimmed));
}

/**
 * 移除最近项目
 */
export function removeRecentProject(path: string): void {
  const list = getRecentProjects().filter((p) => p.path !== path);
  localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(list));
}

/**
 * 保存项目到文件
 * Electron 环境：写入磁盘；浏览器环境：写入 localStorage
 */
export async function saveProject(data: ProjectData, path: string): Promise<void> {
  if (isElectron && window.electronAPI?.saveProject) {
    await window.electronAPI.saveProject(data, path);
  } else {
    // 浏览器降级：用 localStorage
    localStorage.setItem(`project_${path}`, JSON.stringify(data));
  }
  addRecentProject({
    name: data.meta.name,
    path,
    lastModified: new Date().toISOString(),
  });
}

/**
 * 加载项目文件
 */
export async function loadProject(path: string): Promise<ProjectData | null> {
  if (isElectron && window.electronAPI?.loadProject) {
    return await window.electronAPI.loadProject(path);
  } else {
    const raw = localStorage.getItem(`project_${path}`);
    if (!raw) return null;
    return JSON.parse(raw) as ProjectData;
  }
}

/**
 * 选择文件夹（新建项目保存路径）
 */
export async function selectFolder(): Promise<string | null> {
  if (isElectron && window.electronAPI?.selectFolder) {
    return await window.electronAPI.selectFolder();
  }
  // 浏览器降级：返回一个虚拟路径
  return `browser_project_${Date.now()}`;
}

/**
 * 导出 Ren'Py 工程
 */
export async function exportRenpyProject(
  data: ProjectData,
  scriptRpy: string,
  optionsRpy: string,
  variablesRpy: string,
  screensRpy: string,
  exportDir: string
): Promise<string> {
  if (isElectron && window.electronAPI?.exportProject) {
    return await window.electronAPI.exportProject(
      data,
      scriptRpy,
      optionsRpy,
      variablesRpy,
      screensRpy,
      exportDir
    );
  }
  // 浏览器降级：生成可下载的文本
  const blob = new Blob([scriptRpy], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'script.rpy';
  a.click();
  URL.revokeObjectURL(url);
  return 'browser_download';
}

/**
 * 启动预览
 */
export async function startPreview(
  data: ProjectData,
  scriptRpy: string,
  optionsRpy: string,
  variablesRpy: string,
  screensRpy: string,
  fromSceneId?: string
): Promise<void> {
  if (isElectron && window.electronAPI?.startPreview) {
    await window.electronAPI.startPreview(
      data,
      scriptRpy,
      optionsRpy,
      variablesRpy,
      screensRpy,
      fromSceneId
    );
    return;
  }
  // 浏览器降级：显示生成的脚本
  console.log('=== 预览（浏览器降级模式）===');
  console.log(scriptRpy);
  alert("浏览器降级模式：已生成 script.rpy 到控制台。请在 Electron 环境中运行以启动 Ren'Py 预览。");
}

// TypeScript 全局类型声明
declare global {
  interface Window {
    electronAPI?: {
      saveProject: (data: ProjectData, path: string) => Promise<void>;
      loadProject: (path: string) => Promise<ProjectData | null>;
      selectFolder: () => Promise<string | null>;
      exportProject: (
        data: ProjectData,
        scriptRpy: string,
        optionsRpy: string,
        variablesRpy: string,
        screensRpy: string,
        exportDir: string
      ) => Promise<string>;
      startPreview: (
        data: ProjectData,
        scriptRpy: string,
        optionsRpy: string,
        variablesRpy: string,
        screensRpy: string,
        fromSceneId?: string
      ) => Promise<void>;
      importAssets: (projectPath: string, filePaths: string[]) => Promise<any[]>;
      onAssetWatcher: (callback: (event: string, path: string) => void) => void;
    };
  }
}
