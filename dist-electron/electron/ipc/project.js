"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerProjectHandlers = registerProjectHandlers;
/**
 * 项目文件 IPC 处理器 - 保存/加载项目、导出 Ren'Py 工程
 * 对应文档第二、五、六章
 */
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
/**
 * 确保项目目录结构完整
 */
function ensureProjectStructure(projectDir) {
    const dirs = ['scenes', 'assets/images', 'assets/videos', 'assets/audio', 'assets/thumbnails', 'export'];
    for (const dir of dirs) {
        const fullPath = path.join(projectDir, dir);
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
        }
    }
}
/**
 * 保存项目
 */
electron_1.ipcMain.handle('project:save', async (_event, data, projectPath) => {
    try {
        ensureProjectStructure(projectPath);
        // 保存 project.json
        const projectJsonPath = path.join(projectPath, 'project.json');
        fs.writeFileSync(projectJsonPath, JSON.stringify(data.meta, null, 2), 'utf-8');
        // 保存 variables.json
        const variablesPath = path.join(projectPath, 'variables.json');
        fs.writeFileSync(variablesPath, JSON.stringify(data.variables, null, 2), 'utf-8');
        // 保存 characters.json
        const charactersPath = path.join(projectPath, 'characters.json');
        fs.writeFileSync(charactersPath, JSON.stringify(data.characters, null, 2), 'utf-8');
        // 保存 scenes/*.json
        const scenesDir = path.join(projectPath, 'scenes');
        // 清空旧场景文件
        const oldFiles = fs.readdirSync(scenesDir).filter((f) => f.endsWith('.json'));
        for (const f of oldFiles) {
            fs.unlinkSync(path.join(scenesDir, f));
        }
        // 写入新场景文件
        for (const scene of Object.values(data.scenes)) {
            const sceneFile = path.join(scenesDir, `scene_${scene.id}.json`);
            fs.writeFileSync(sceneFile, JSON.stringify(scene, null, 2), 'utf-8');
        }
        // 保存素材索引
        const metadataPath = path.join(projectPath, 'assets', 'metadata.json');
        fs.writeFileSync(metadataPath, JSON.stringify(data.assets, null, 2), 'utf-8');
        return { success: true };
    }
    catch (e) {
        throw new Error(`保存项目失败: ${e.message}`);
    }
});
/**
 * 加载项目
 */
electron_1.ipcMain.handle('project:load', async (_event, projectPath) => {
    try {
        const projectJsonPath = path.join(projectPath, 'project.json');
        if (!fs.existsSync(projectJsonPath)) {
            return null;
        }
        const meta = JSON.parse(fs.readFileSync(projectJsonPath, 'utf-8'));
        // 加载变量
        let variables = [];
        const variablesPath = path.join(projectPath, 'variables.json');
        if (fs.existsSync(variablesPath)) {
            variables = JSON.parse(fs.readFileSync(variablesPath, 'utf-8'));
        }
        // 加载角色
        let characters = [];
        const charactersPath = path.join(projectPath, 'characters.json');
        if (fs.existsSync(charactersPath)) {
            characters = JSON.parse(fs.readFileSync(charactersPath, 'utf-8'));
        }
        // 加载场景
        const scenes = {};
        const scenesDir = path.join(projectPath, 'scenes');
        if (fs.existsSync(scenesDir)) {
            const sceneFiles = fs.readdirSync(scenesDir).filter((f) => f.startsWith('scene_') && f.endsWith('.json'));
            for (const f of sceneFiles) {
                const scene = JSON.parse(fs.readFileSync(path.join(scenesDir, f), 'utf-8'));
                scenes[scene.id] = scene;
            }
        }
        // 加载素材
        let assets = [];
        const metadataPath = path.join(projectPath, 'assets', 'metadata.json');
        if (fs.existsSync(metadataPath)) {
            assets = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        }
        return {
            meta,
            scenes,
            assets,
            characters,
            variables,
        };
    }
    catch (e) {
        throw new Error(`加载项目失败: ${e.message}`);
    }
});
/**
 * 导出 Ren'Py 工程
 * 对应文档第五章编译流水线 Step 5-6
 */
electron_1.ipcMain.handle('project:export', async (_event, data, scriptRpy, optionsRpy, variablesRpy, screensRpy, exportDir) => {
    try {
        const gameName = data.meta.name || 'MyGame';
        const exportPath = path.join(exportDir, gameName);
        const gameDir = path.join(exportPath, 'game');
        // 创建目录结构
        fs.mkdirSync(path.join(gameDir, 'images'), { recursive: true });
        fs.mkdirSync(path.join(gameDir, 'audio'), { recursive: true });
        fs.mkdirSync(path.join(gameDir, 'gui'), { recursive: true });
        // 写入脚本文件
        fs.writeFileSync(path.join(gameDir, 'script.rpy'), scriptRpy, 'utf-8');
        fs.writeFileSync(path.join(gameDir, 'options.rpy'), optionsRpy, 'utf-8');
        fs.writeFileSync(path.join(gameDir, 'variables.rpy'), variablesRpy, 'utf-8');
        fs.writeFileSync(path.join(gameDir, 'screens.rpy'), screensRpy, 'utf-8');
        // 复制素材文件
        const projectPath = exportDir;
        for (const asset of data.assets) {
            const srcPath = path.join(projectPath, 'assets', asset.relativePath);
            if (fs.existsSync(srcPath)) {
                let destDir;
                if (['png', 'jpg', 'jpeg'].includes(asset.format)) {
                    destDir = path.join(gameDir, 'images');
                }
                else {
                    destDir = path.join(gameDir, 'audio');
                }
                const destPath = path.join(destDir, asset.fileName);
                if (!fs.existsSync(destPath)) {
                    fs.copyFileSync(srcPath, destPath);
                }
            }
        }
        // 打开导出目录
        electron_1.shell.openPath(exportPath);
        return exportPath;
    }
    catch (e) {
        throw new Error(`导出失败: ${e.message}`);
    }
});
function registerProjectHandlers() {
    // 处理器已通过 ipcMain.handle 注册
    console.log('[IPC] 项目处理器已注册');
}
//# sourceMappingURL=project.js.map