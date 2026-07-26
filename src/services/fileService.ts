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
  // 保存操作与最近项目更新分离，避免更新失败误报保存失败
  if (isElectron && window.electronAPI?.saveProject) {
    await window.electronAPI.saveProject(data, path);
  } else {
    // 浏览器降级：用 localStorage
    localStorage.setItem(`project_${path}`, JSON.stringify(data));
  }
  // 更新最近项目列表，失败不影响保存结果
  try {
    addRecentProject({
      name: data.meta.name,
      path,
      lastModified: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('更新最近项目列表失败:', e);
  }
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
 * Electron 环境：系统文件夹选择器
 * 浏览器环境：webkitdirectory 文件夹选择器
 */
export async function selectFolder(): Promise<string | null> {
  if (isElectron && window.electronAPI?.selectFolder) {
    return await window.electronAPI.selectFolder();
  }
  // 浏览器降级：使用 input[webkitdirectory] 调用系统文件夹选择器
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
    input.style.position = 'fixed';
    input.style.top = '-9999px';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      document.body.removeChild(input);
      if (input.files && input.files.length > 0) {
        // webkitRelativePath 形如 "MyFolder/sub/file.png"，取顶层目录名
        const relPath = input.files[0].webkitRelativePath || input.files[0].name;
        const topDir = relPath.split('/')[0];
        resolve(topDir || `browser_project_${Date.now()}`);
      } else {
        resolve(null);
      }
    });
    input.addEventListener('cancel', () => {
      document.body.removeChild(input);
      resolve(null);
    });
    input.click();
  });
}

/**
 * 选择文件（素材导入）
 * Electron 环境：系统文件选择器
 * 浏览器环境：input[type=file] 文件选择器
 * @param accept 文件类型过滤，如 "image/png,image/jpeg"
 */
export async function selectFiles(accept?: string): Promise<string[] | null> {
  if (isElectron && window.electronAPI?.selectFiles) {
    // 将 accept MIME 映射为 Electron 扩展名过滤器
    let filters: { name: string; extensions: string[] }[] | undefined;
    if (accept) {
      const exts = accept
        .split(',')
        .map((a) => a.trim())
        .filter((a) => a.startsWith('.'))
        .map((a) => a.slice(1).toLowerCase());
      if (exts.length > 0) {
        filters = [{ name: '素材', extensions: exts }];
      }
    }
    return await window.electronAPI.selectFiles(filters);
  }
  // 浏览器降级：使用 input[type=file] 调用系统文件选择器
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    if (accept) input.accept = accept;
    input.style.position = 'fixed';
    input.style.top = '-9999px';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      document.body.removeChild(input);
      if (input.files && input.files.length > 0) {
        // 浏览器环境下返回文件对象引用（通过 File.name 作为占位路径，
        // 实际导入由 importAssetsBrowser 处理 File 对象）
        const fileNames: string[] = [];
        for (let i = 0; i < input.files.length; i++) {
          fileNames.push(input.files[i].name);
        }
        // 将 File 对象暂存到全局，供 importAssetsBrowser 取用
        (window as any).__pendingImportFiles = Array.from(input.files);
        resolve(fileNames);
      } else {
        resolve(null);
      }
    });
    input.addEventListener('cancel', () => {
      document.body.removeChild(input);
      resolve(null);
    });
    input.click();
  });
}

/**
 * 导入素材文件
 * Electron 环境：调用主进程复制文件并返回 AssetEntry
 * 浏览器环境：基于已选择的 File 对象生成 AssetEntry（无实际文件复制）
 */
export async function importAssets(
  projectPath: string,
  filePaths: string[]
): Promise<any[]> {
  if (isElectron && window.electronAPI?.importAssets) {
    return await window.electronAPI.importAssets(projectPath, filePaths);
  }
  // 浏览器降级：基于暂存的 File 对象生成素材条目
  const pendingFiles: File[] = (window as any).__pendingImportFiles || [];
  (window as any).__pendingImportFiles = null;

  const FORMAT_TO_TYPE: Record<string, string> = {
    png: 'background',
    jpg: 'background',
    jpeg: 'background',
    mp4: 'video',
    webm: 'video',
    ogg: 'bgm',
    mp3: 'bgm',
    wav: 'sfx',
  };

  const results: any[] = [];
  for (const file of pendingFiles) {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const type = FORMAT_TO_TYPE[ext];
    if (!type) continue;

    let subDir = 'images';
    if (['mp4', 'webm'].includes(ext)) subDir = 'videos';
    else if (['ogg', 'mp3', 'wav'].includes(ext)) subDir = 'audio';

    // 分析文件名提取元数据（角色名_表情）
    const baseName = file.name.replace(/\.[^.]+$/, '');
    let characterId: string | undefined;
    let emotion: string | undefined;
    const match = baseName.match(/^([a-zA-Z_][a-zA-Z0-9_]*)_(.+)$/);
    if (match && type === 'background') {
      characterId = match[1];
      emotion = match[2];
    }

    const isImage = type === 'background' || (characterId ? true : false);
    const isVideo = type === 'video';
    const isAudio = ['bgm', 'sfx', 'voice'].includes(type);

    results.push({
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`,
      fileName: file.name,
      relativePath: `${subDir}/${file.name}`,
      type: characterId ? 'sprite' : type,
      format: ext,
      fileSize: file.size,
      resolution: isImage || isVideo ? { width: 1280, height: 720 } : undefined,
      duration: isVideo || isAudio ? Math.floor(Math.random() * 60) + 1 : undefined,
      characterId,
      emotion,
      tags: [],
      thumbnailPath: `thumbnails/${file.name}`,
      importedAt: new Date().toISOString(),
    });
  }
  return results;
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
      selectFiles: (filters?: { name: string; extensions: string[] }[]) => Promise<string[] | null>;
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
