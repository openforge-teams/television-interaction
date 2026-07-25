"use strict";
/**
 * 影游工坊 - 核心数据模型与类型定义
 * 对应文档第二章至第四章的数据结构
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ASSET_WHITELIST = exports.FONT_PRESETS = exports.RESOLUTION_PRESETS = exports.TRACKS = void 0;
exports.getAssetTypeFromFormat = getAssetTypeFromFormat;
exports.TRACKS = [
    { index: 0, name: '背景', maxConcurrent: 1, acceptedTypes: ['background'] },
    { index: 1, name: '立绘', maxConcurrent: 3, acceptedTypes: ['sprite'] },
    { index: 2, name: '对话', maxConcurrent: 1, acceptedTypes: ['dialogue'] },
    { index: 3, name: '音频', maxConcurrent: 3, acceptedTypes: ['audio'] },
    { index: 4, name: '选项', maxConcurrent: 1, acceptedTypes: ['choice'] },
    { index: 5, name: '跳转/标签', maxConcurrent: Infinity, acceptedTypes: ['jump_label', 'variable_op'] },
];
// ============================================================
// 分辨率预设
// ============================================================
exports.RESOLUTION_PRESETS = [
    { label: '960x540', width: 960, height: 540 },
    { label: '1280x720', width: 1280, height: 720 },
    { label: '1920x1080', width: 1920, height: 1080 },
];
exports.FONT_PRESETS = [
    'Noto Sans SC',
    'Source Han Sans CN',
    'Microsoft YaHei',
    'SimHei',
    'WenQuanYi Micro Hei',
];
// 素材白名单
exports.ASSET_WHITELIST = {
    background: ['png', 'jpg', 'jpeg'],
    sprite: ['png', 'jpg', 'jpeg'],
    video: ['mp4', 'webm'],
    bgm: ['ogg', 'mp3', 'wav'],
    sfx: ['ogg', 'mp3', 'wav'],
    voice: ['ogg', 'mp3', 'wav'],
};
function getAssetTypeFromFormat(format) {
    const f = format.toLowerCase();
    if (['png', 'jpg', 'jpeg'].includes(f))
        return 'background'; // 默认背景，可改立绘
    if (['mp4', 'webm'].includes(f))
        return 'video';
    if (['ogg', 'mp3', 'wav'].includes(f))
        return 'bgm';
    return null;
}
//# sourceMappingURL=index.js.map