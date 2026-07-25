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
exports.registerAssetHandlers = registerAssetHandlers;
/**
 * 素材导入 IPC 处理器 - 对应文档第二章素材导入流程
 */
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const uuid_1 = require("uuid");
const FORMAT_TO_TYPE = {
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
electron_1.ipcMain.handle('assets:import', async (_event, projectPath, filePaths) => {
    const results = [];
    for (const filePath of filePaths) {
        const fileName = path.basename(filePath);
        const ext = path.extname(fileName).slice(1).toLowerCase();
        if (!FORMAT_TO_TYPE[ext]) {
            console.warn(`不支持的文件格式: ${fileName}`);
            continue;
        }
        const type = FORMAT_TO_TYPE[ext];
        const assetId = (0, uuid_1.v4)();
        // 确定目标子目录
        let subDir;
        if (['png', 'jpg', 'jpeg'].includes(ext)) {
            subDir = 'images';
        }
        else if (['mp4', 'webm'].includes(ext)) {
            subDir = 'videos';
        }
        else {
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
        let characterId;
        let emotion;
        const match = baseName.match(/^([a-zA-Z_][a-zA-Z0-9_]*)_(.+)$/);
        if (match && type === 'background') {
            // 可能是立绘
            characterId = match[1];
            emotion = match[2];
        }
        const stat = fs.statSync(filePath);
        const entry = {
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
function registerAssetHandlers() {
    console.log('[IPC] 素材处理器已注册');
}
//# sourceMappingURL=asset.js.map