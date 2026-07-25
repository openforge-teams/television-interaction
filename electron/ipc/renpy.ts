/**
 * Ren'Py 预览与导出 IPC 处理器 - 对应文档第六章
 */
import { ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import type { ProjectData } from '../../src/types';

let previewProcess: ChildProcess | null = null;

/**
 * 获取 Ren'Py SDK 路径
 * MVP 内嵌于 resources/renpy/ 目录，或通过环境变量 RENPY_SDK_PATH 指定
 */
function getRenpySdkPath(): string {
  // 1. 环境变量
  if (process.env.RENPY_SDK_PATH) {
    return process.env.RENPY_SDK_PATH;
  }
  // 2. 内嵌路径（打包后）
  const embeddedPath = path.join(process.resourcesPath || '', 'renpy');
  if (fs.existsSync(embeddedPath)) {
    return embeddedPath;
  }
  // 3. 开发环境
  const devPath = path.join(__dirname, '..', 'resources', 'renpy');
  return devPath;
}

/**
 * 获取 Ren'Py 可执行文件路径
 */
function getRenpyExecutable(): string {
  const sdkPath = getRenpySdkPath();
  if (process.platform === 'win32') {
    return path.join(sdkPath, 'renpy.exe');
  } else if (process.platform === 'darwin') {
    return path.join(sdkPath, 'renpy.sh');
  } else {
    return path.join(sdkPath, 'renpy.sh');
  }
}

/**
 * 启动预览
 * 对应文档 6.1 预览机制
 */
ipcMain.handle(
  'preview:start',
  async (
    _event,
    data: ProjectData,
    scriptRpy: string,
    optionsRpy: string,
    variablesRpy: string,
    screensRpy: string,
    fromSceneId?: string
  ) => {
    try {
      // 如果已有预览进程在运行，先终止
      if (previewProcess) {
        previewProcess.kill();
        previewProcess = null;
      }

      // 生成临时预览工程
      const tempDir = path.join(require('os').tmpdir(), `yingyou_preview_${Date.now()}`);
      const gameDir = path.join(tempDir, 'game');
      fs.mkdirSync(path.join(gameDir, 'images'), { recursive: true });
      fs.mkdirSync(path.join(gameDir, 'audio'), { recursive: true });

      // 如果指定了从某场景预览，在脚本开头插入跳转
      let finalScript = scriptRpy;
      if (fromSceneId) {
        const scene = data.scenes[fromSceneId];
        if (scene) {
          const labelName = scene.name.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_').toLowerCase();
          // 在 label start: 之后插入跳转
          finalScript = finalScript.replace(
            'label start:',
            `label start:\n    jump ${labelName}`
          );
        }
      }

      fs.writeFileSync(path.join(gameDir, 'script.rpy'), finalScript, 'utf-8');
      fs.writeFileSync(path.join(gameDir, 'options.rpy'), optionsRpy, 'utf-8');
      fs.writeFileSync(path.join(gameDir, 'variables.rpy'), variablesRpy, 'utf-8');
      fs.writeFileSync(path.join(gameDir, 'screens.rpy'), screensRpy, 'utf-8');

      // 复制素材（从项目路径）
      const projectPath = data.meta.name; // TODO: 需要传入实际项目路径
      // MVP: 仅复制已知素材

      // 启动 Ren'Py
      const renpyExe = getRenpyExecutable();
      const args = [
        tempDir,
        '--windowed',
        `--resolution`,
        `${data.meta.resolution.width}x${data.meta.resolution.height}`,
      ];

      console.log(`[Preview] 启动 Ren'Py: ${renpyExe} ${args.join(' ')}`);

      previewProcess = spawn(renpyExe, args, {
        stdio: 'pipe',
        cwd: path.dirname(renpyExe),
      });

      previewProcess.stdout?.on('data', (data) => {
        console.log(`[Ren'Py] ${data.toString()}`);
      });

      previewProcess.stderr?.on('data', (data) => {
        console.error(`[Ren'Py Error] ${data.toString()}`);
      });

      previewProcess.on('exit', (code) => {
        console.log(`[Ren'Py] 进程退出，代码: ${code}`);
        previewProcess = null;
        // 清理临时文件
        setTimeout(() => {
          try {
            fs.rmSync(tempDir, { recursive: true, force: true });
          } catch (e) {
            console.warn(`[Preview] 清理临时文件失败: ${(e as Error).message}`);
          }
        }, 5000);
      });

      return { success: true, tempDir };
    } catch (e) {
      throw new Error(`预览启动失败: ${(e as Error).message}`);
    }
  }
);

export function registerPreviewHandlers() {
  console.log('[IPC] 预览处理器已注册');

  // 应用退出时清理预览进程
  process.on('exit', () => {
    if (previewProcess) {
      previewProcess.kill();
    }
  });
}
