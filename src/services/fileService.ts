/**
 * 文件服务 - 浏览器端文件管理
 *
 * 架构说明：
 * 本应用是纯浏览器端应用，无法像桌面端那样自由访问本地文件系统。
 * - 素材文件：导入时以 Blob 形式存入 IndexedDB，运行时通过 Object URL 使用
 * - 项目数据：自动保存到 IndexedDB，无需选择路径
 * - 导出：将项目数据 + 素材打包为 ZIP 文件下载
 * - 导入：读取 ZIP 文件恢复项目和素材
 */
import JSZip from 'jszip';
import type { ProjectData, AssetEntry, AssetType, AssetFormat } from '@/types';
import {
  saveAssetBlob,
  deleteAssetBlob,
  getAllAssetBlobs,
  saveProjectToIDB,
  loadProjectFromIDB,
  deleteProjectFromIDB,
  getMeta,
  setMeta,
  getAssetURL,
  clearURLCache,
  clearAllAssets,
} from './idb';

// 检测是否在 Electron 环境中（仍保留 Electron 支持）
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

// 最近项目存储
const RECENT_PROJECTS_KEY = 'yingyou_recent_projects';
const AUTOSAVE_KEY = 'autosave';

export interface RecentProject {
  name: string;
  key: string; // IndexedDB 中的 key
  lastModified: string;
  thumbnail?: string;
}

// ============ 最近项目列表 ============

export async function getRecentProjects(): Promise<RecentProject[]> {
  const list = await getMeta<RecentProject[]>(RECENT_PROJECTS_KEY);
  return list ?? [];
}

async function addRecentProject(project: RecentProject): Promise<void> {
  const list = await getRecentProjects();
  const filtered = list.filter((p) => p.key !== project.key);
  filtered.unshift(project);
  await setMeta(RECENT_PROJECTS_KEY, filtered.slice(0, 20));
}

export async function removeRecentProject(key: string): Promise<void> {
  const list = await getRecentProjects();
  await setMeta(
    RECENT_PROJECTS_KEY,
    list.filter((p) => p.key !== key)
  );
  await deleteProjectFromIDB(key);
}

// ============ 文件选择器 ============

/**
 * 选择文件（素材导入）
 * 使用系统文件选择器
 * @param accept 文件类型过滤，如 ".png,.jpg,.jpeg"
 */
export async function selectFiles(accept?: string): Promise<File[] | null> {
  // Electron 环境
  if (isElectron && window.electronAPI?.selectFiles) {
    let filters: { name: string; extensions: string[] }[] | undefined;
    if (accept) {
      const exts = accept
        .split(',')
        .map((a) => a.trim())
        .filter((a) => a.startsWith('.'))
        .map((a) => a.slice(1).toLowerCase());
      if (exts.length > 0) filters = [{ name: '素材', extensions: exts }];
    }
    const paths = await window.electronAPI.selectFiles(filters);
    if (!paths || paths.length === 0) return null;
    // Electron 返回的是路径，无法直接转 File，走 IPC 导入
    // 这里返回伪 File 对象，由 importAssets 处理
    return paths.map((p) => {
      const name = p.split(/[\\/]/).pop() || p;
      return new File([], name);
    });
  }
  // 浏览器环境：使用 input[type=file]
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
        resolve(Array.from(input.files));
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
 * 选择单个 ZIP 文件（导入项目）
 */
export async function selectProjectFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.yypkg,.zip';
    input.style.position = 'fixed';
    input.style.top = '-9999px';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      document.body.removeChild(input);
      if (input.files && input.files.length > 0) {
        resolve(input.files[0]);
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

// ============ 素材导入 ============

const FORMAT_TO_TYPE: Record<string, AssetType> = {
  png: 'background',
  jpg: 'background',
  jpeg: 'background',
  mp4: 'video',
  webm: 'video',
  ogg: 'bgm',
  mp3: 'bgm',
  wav: 'sfx',
};

/**
 * 导入素材文件到浏览器
 * 将 File 对象存入 IndexedDB，返回 AssetEntry 元数据
 */
export async function importAssetFiles(
  files: File[]
): Promise<AssetEntry[]> {
  const results: AssetEntry[] = [];

  for (const file of files) {
    const ext = file.name.split('.').pop()?.toLowerCase() as AssetFormat;
    const type = FORMAT_TO_TYPE[ext];
    if (!type) continue;

    const assetId = crypto.randomUUID();

    // 分析文件名提取元数据（角色名_表情）
    const baseName = file.name.replace(/\.[^.]+$/, '');
    let characterId: string | undefined;
    let emotion: string | undefined;
    const match = baseName.match(/^([a-zA-Z_][a-zA-Z0-9_]*)_(.+)$/);
    if (match && type === 'background') {
      characterId = match[1];
      emotion = match[2];
    }

    const actualType = characterId ? 'sprite' : type;

    // 存入 IndexedDB
    await saveAssetBlob(assetId, file);

    // 获取图片尺寸（如果是图片）
    let resolution: { width: number; height: number } | undefined;
    if (['png', 'jpg', 'jpeg'].includes(ext)) {
      resolution = await getImageDimensions(file).catch(() => undefined);
    }

    const entry: AssetEntry = {
      id: assetId,
      fileName: file.name,
      relativePath: `assets/${assetId}_${file.name}`,
      type: actualType,
      format: ext,
      fileSize: file.size,
      resolution,
      characterId,
      emotion,
      tags: [],
      thumbnailPath: `thumbnails/${assetId}`,
      importedAt: new Date().toISOString(),
    };
    results.push(entry);
  }

  return results;
}

/** 获取图片尺寸 */
function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片加载失败'));
    };
    img.src = url;
  });
}

/** 获取素材的 Object URL（用于预览/渲染） */
export async function getAssetURL2(assetId: string): Promise<string | null> {
  return getAssetURL(assetId);
}

/** 删除素材（同时清理 IndexedDB） */
export async function removeAsset(assetId: string): Promise<void> {
  await deleteAssetBlob(assetId);
}

// ============ 项目保存/加载 ============

/**
 * 自动保存项目到 IndexedDB
 * 无需选择路径，自动持久化
 */
export async function saveProject(data: ProjectData): Promise<string> {
  const key = AUTOSAVE_KEY;
  await saveProjectToIDB(key, data);
  await addRecentProject({
    name: data.meta.name,
    key,
    lastModified: new Date().toISOString(),
  });
  return key;
}

/**
 * 从 IndexedDB 加载自动保存的项目
 */
export async function loadProject(): Promise<ProjectData | null> {
  return loadProjectFromIDB<ProjectData>(AUTOSAVE_KEY);
}

/**
 * 加载指定项目（从最近列表）
 */
export async function loadProjectByKey(key: string): Promise<ProjectData | null> {
  return loadProjectFromIDB<ProjectData>(key);
}

// ============ 项目导出（ZIP 下载） ============

/**
 * 导出项目为 ZIP 文件下载
 * 包含 project.json + 所有素材文件 + Ren'Py 脚本
 */
export async function exportProjectPackage(
  data: ProjectData,
  scriptRpy?: string,
  optionsRpy?: string,
  variablesRpy?: string,
  screensRpy?: string
): Promise<void> {
  const zip = new JSZip();

  // 1. 项目数据
  zip.file('project.json', JSON.stringify(data, null, 2));

  // 2. Ren'Py 脚本（如果有）
  const renpyFolder = zip.folder('renpy');
  if (scriptRpy) renpyFolder?.file('script.rpy', scriptRpy);
  if (optionsRpy) renpyFolder?.file('options.rpy', optionsRpy);
  if (variablesRpy) renpyFolder?.file('variables.rpy', variablesRpy);
  if (screensRpy) renpyFolder?.file('screens.rpy', screensRpy);

  // 3. 素材文件
  const assetsFolder = zip.folder('assets');
  const blobs = await getAllAssetBlobs();
  for (const asset of data.assets) {
    const blob = blobs.get(asset.id);
    if (blob) {
      assetsFolder?.file(asset.fileName, blob);
    }
  }

  // 4. 生成 ZIP 并下载
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.meta.name || '项目'}.yypkg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 导出 Ren'Py 工程（兼容旧接口，Electron 桌面端写入磁盘）
 */
export async function exportRenpyProject(
  data: ProjectData,
  scriptRpy: string,
  optionsRpy: string,
  variablesRpy: string,
  screensRpy: string,
  _exportDir: string
): Promise<string> {
  if (isElectron && window.electronAPI?.exportProject) {
    return await window.electronAPI.exportProject(
      data,
      scriptRpy,
      optionsRpy,
      variablesRpy,
      screensRpy,
      ''
    );
  }
  // 浏览器端：打包为 ZIP 下载
  await exportProjectPackage(data, scriptRpy, optionsRpy, variablesRpy, screensRpy);
  return 'browser_download';
}

// ============ 项目导入（从 ZIP） ============

/**
 * 从 ZIP 文件导入项目
 * 恢复项目数据和所有素材到 IndexedDB
 */
export async function importProjectPackage(file: File): Promise<ProjectData | null> {
  const zip = await JSZip.loadAsync(file);

  // 1. 读取项目数据
  const projectFile = zip.file('project.json');
  if (!projectFile) {
    throw new Error('无效的项目文件：缺少 project.json');
  }
  const projectJson = await projectFile.async('text');
  const data = JSON.parse(projectJson) as ProjectData;

  // 2. 清空旧的 IndexedDB 素材
  await clearAllAssets();
  clearURLCache();

  // 3. 恢复素材文件到 IndexedDB
  const assetsFolder = zip.folder('assets');
  if (assetsFolder) {
    const entries = Object.values(zip.files).filter(
      (f) => !f.dir && f.name.startsWith('assets/')
    );
    for (const entry of entries) {
      const blob = await entry.async('blob');
      const fileName = entry.name.replace('assets/', '');
      // 找到对应的 asset entry
      const assetEntry = data.assets.find((a) => a.fileName === fileName);
      if (assetEntry) {
        await saveAssetBlob(assetEntry.id, blob);
      }
    }
  }

  // 4. 保存到 IndexedDB
  await saveProjectToIDB(AUTOSAVE_KEY, data);
  await addRecentProject({
    name: data.meta.name,
    key: AUTOSAVE_KEY,
    lastModified: new Date().toISOString(),
  });

  return data;
}

/**
 * 启动预览（浏览器降级：显示生成的脚本）
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
  // 浏览器降级：在新窗口展示生成的脚本
  const w = window.open('', '_blank');
  if (w) {
    w.document.write(`<pre style="white-space:pre-wrap;word-wrap:break-word;font-family:monospace;padding:16px;">${scriptRpy.replace(/</g, '&lt;')}</pre>`);
    w.document.title = 'Ren\'Py 预览 - script.rpy';
  } else {
    console.log('=== 预览（浏览器降级模式）===');
    console.log(scriptRpy);
    alert('预览已生成到控制台。请在 Electron 环境中运行以启动 Ren\'Py 预览。');
  }
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
