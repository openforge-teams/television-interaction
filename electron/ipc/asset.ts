/**
 * 素材导入 IPC 处理器 - 对应文档第二章素材导入流程
 */
import { ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import AdmZip from 'adm-zip';
import type { AssetEntry, AssetType, AssetFormat } from '../../src/types';

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
 * 导入素材文件
 */
ipcMain.handle('assets:import', async (_event, projectPath: string, filePaths: string[]) => {
  const results: AssetEntry[] = [];

  for (const filePath of filePaths) {
    const fileName = path.basename(filePath);
    const ext = path.extname(fileName).slice(1).toLowerCase() as AssetFormat;

    if (!FORMAT_TO_TYPE[ext]) {
      console.warn(`不支持的文件格式: ${fileName}`);
      continue;
    }

    const type = FORMAT_TO_TYPE[ext];
    const assetId = uuidv4();

    // 确定目标子目录
    let subDir: string;
    if (['png', 'jpg', 'jpeg'].includes(ext)) {
      subDir = 'images';
    } else if (['mp4', 'webm'].includes(ext)) {
      subDir = 'videos';
    } else {
      subDir = 'audio';
    }

    const destDir = path.join(projectPath, 'assets', subDir);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // 复制文件
    const destPath = path.join(destDir, fileName);
    if (!fs.existsSync(destPath)) {
      fs.copyFileSync(filePath, destPath);
    }

    // 生成缩略图路径（实际生成由前端或 sharp 库处理）
    const thumbnailPath = `assets/thumbnails/${assetId}.png`;

    // 分析文件名提取元数据（角色名_表情 或 场景名）
    const baseName = path.basename(fileName, path.extname(fileName));
    let characterId: string | undefined;
    let emotion: string | undefined;
    const match = baseName.match(/^([a-zA-Z_][a-zA-Z0-9_]*)_(.+)$/);
    if (match && type === 'background') {
      // 可能是立绘
      characterId = match[1];
      emotion = match[2];
    }

    const stat = fs.statSync(filePath);

    const entry: AssetEntry = {
      id: assetId,
      fileName,
      relativePath: `${subDir}/${fileName}`,
      type: characterId ? 'sprite' : type,
      format: ext,
      fileSize: stat.size,
      characterId,
      emotion,
      tags: [],
      thumbnailPath,
      importedAt: new Date().toISOString(),
    };

    results.push(entry);
  }

  return results;
});

export function registerAssetHandlers() {
  console.log('[IPC] 素材处理器已注册');
}
