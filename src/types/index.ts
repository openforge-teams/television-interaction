/**
 * 影游工坊 - 核心数据模型与类型定义
 * 对应文档第二章至第四章的数据结构
 */

// ============================================================
// 第一章：项目元数据
// ============================================================

export interface ProjectMeta {
  version: '1.0';
  name: string;
  author: string;
  resolution: { width: number; height: number };
  defaultFont: string;
  themeColor: string;
  createdTime: string; // ISO 8601
  lastModified: string;
  renpyVersion: string;
  sceneOrder: string[]; // 场景 ID 列表，决定顺序
  currentSceneId: string | null;
}

// ============================================================
// 第二章：素材库
// ============================================================

export type AssetType =
  | 'background'
  | 'sprite'
  | 'video'
  | 'bgm'
  | 'sfx'
  | 'voice';

export type AssetFormat =
  | 'png'
  | 'jpg'
  | 'jpeg'
  | 'mp4'
  | 'webm'
  | 'ogg'
  | 'mp3'
  | 'wav';

export interface AssetEntry {
  id: string; // uuid
  fileName: string;
  relativePath: string; // 相对于 assets/ 的路径
  type: AssetType;
  format: AssetFormat;
  fileSize: number;
  resolution?: { width: number; height: number }; // 图片/视频
  duration?: number; // 视频/音频时长（秒）
  characterId?: string; // 如果是立绘，关联的角色 ID
  emotion?: string; // 如果是立绘，表情名称
  tags: string[];
  thumbnailPath: string; // 相对路径
  md5?: string; // 用于去重
  importedAt: string;
}

// ============================================================
// 第三章：角色管理
// ============================================================

export interface CharacterDef {
  id: string; // 只能字母数字下划线
  displayName: string;
  color: string; // hex
  voicePrefix: string;
  defaultEmotion: string;
  emotions: Record<string, string>; // emotion -> assetId
}

// ============================================================
// 第四章：变量系统
// ============================================================

export type VariableType = 'integer' | 'float' | 'string' | 'boolean';

export interface VariableDef {
  name: string; // 字母开头，只能含字母数字下划线
  type: VariableType;
  initialValue: number | string | boolean;
  description?: string;
}

export type VariableOperation =
  | 'set'
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide';

export interface VariableEffect {
  variableName: string;
  operation: VariableOperation;
  value: number | string | boolean;
}

// ============================================================
// 第四章：分镜节点（核心）
// ============================================================

export type NodeType =
  | 'background'
  | 'sprite'
  | 'video'
  | 'dialogue'
  | 'audio'
  | 'choice'
  | 'jump_label'
  | 'variable_op';

// 通用分镜基类
export interface BaseNode {
  id: string; // uuid
  type: NodeType;
  trackIndex: number; // 所属轨道索引 (0=背景,1=立绘,2=对话,3=音频,4=选项,5=跳转)
  position: number; // 在轨道上的顺序索引（从0开始）
  label?: string; // 可选标签，用于跳转目标
}

// 过渡类型
export type TransitionType =
  | 'none'
  | 'dissolve'
  | 'fade'
  | 'pushright'
  | 'wipeleft';

// 背景节点
export interface BackgroundNode extends BaseNode {
  type: 'background';
  assetId: string;
  transition: TransitionType;
  transitionDuration: number; // 秒，0.5~5.0
  waitForTransition: boolean;
}

// 立绘位置
export type SpritePosition = 'left' | 'center' | 'right' | 'truecenter';
export type EnterEffect = 'none' | 'easein' | 'easeout' | 'moveinleft' | 'moveinright';
export type ExitEffect = 'none' | 'fadeout' | 'slideout';

// 立绘节点
export interface SpriteNode extends BaseNode {
  type: 'sprite';
  characterId: string;
  emotion: string;
  screenPosition: SpritePosition; // 屏幕位置（left/center/right/truecenter），与 BaseNode.position（轨道顺序）区分
  enterEffect: EnterEffect;
  exitEffect: ExitEffect;
  zorder: number;
  visible: boolean;
  transform?: string;
}

// 对话节点
export interface DialogueNode extends BaseNode {
  type: 'dialogue';
  speakerId: string | null; // null 表示旁白
  text: string;
  textStyle: {
    fontSize: number;
    fontColor: string;
    alignment: 'left' | 'center' | 'right';
  };
  voiceAssetId?: string;
  typewriterSpeed: number; // 0 = 立即显示，>0 表示每秒字数
  autoAdvance: boolean;
  autoAdvanceDelay: number;
}

// 视频节点
export interface VideoNode extends BaseNode {
  type: 'video';
  assetId: string;
  playMode: 'play_and_pause' | 'play_and_continue';
  showChoicesOverlay: boolean;
  skipAllowed: boolean;
  volume: number; // 0~100
}

// 音频节点
export interface AudioNode extends BaseNode {
  type: 'audio';
  assetId: string;
  audioType: 'bgm' | 'sfx' | 'voice';
  loop: boolean;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  action: 'play' | 'stop' | 'pause' | 'resume';
}

// 选项节点
export interface ChoiceNode extends BaseNode {
  type: 'choice';
  choices: ChoiceItem[];
  layout: 'vertical' | 'horizontal' | 'grid';
  buttonStyle: {
    backgroundColor: string;
    textColor: string;
    hoverBackgroundColor: string;
    borderRadius: number;
    fontSize: number;
  };
}

export interface ChoiceItem {
  id: string;
  text: string;
  targetSceneId: string; // 跳转的目标场景 ID
  condition?: string; // 例如 "trust >= 80"，空字符串表示无条件
  variableEffects?: VariableEffect[];
}

// 跳转/标签节点
export interface JumpLabelNode extends BaseNode {
  type: 'jump_label';
  subType: 'label' | 'jump' | 'return';
  targetLabel?: string;
  labelName?: string;
}

// 变量操作节点（放在跳转/标签轨道）
export interface VariableOpNode extends BaseNode {
  type: 'variable_op';
  variableName: string;
  operation: VariableOperation;
  value: number | string | boolean;
}

// 联合类型
export type SceneNode =
  | BackgroundNode
  | SpriteNode
  | DialogueNode
  | VideoNode
  | AudioNode
  | ChoiceNode
  | JumpLabelNode
  | VariableOpNode;

// ============================================================
// 场景定义
// ============================================================

export interface Scene {
  id: string; // uuid
  name: string;
  nodes: SceneNode[];
  color?: string; // 场景卡片颜色（导航栏用）
}

// ============================================================
// 轨道定义
// ============================================================

export interface TrackDef {
  index: number;
  name: string;
  maxConcurrent: number; // 最大并发节点数
  acceptedTypes: NodeType[];
}

export const TRACKS: TrackDef[] = [
  { index: 0, name: '背景/视频', maxConcurrent: 1, acceptedTypes: ['background', 'video'] },
  { index: 1, name: '立绘', maxConcurrent: 3, acceptedTypes: ['sprite'] },
  { index: 2, name: '对话', maxConcurrent: 1, acceptedTypes: ['dialogue'] },
  { index: 3, name: '音频', maxConcurrent: 3, acceptedTypes: ['audio'] },
  { index: 4, name: '选项', maxConcurrent: 1, acceptedTypes: ['choice'] },
  { index: 5, name: '跳转/标签', maxConcurrent: Infinity, acceptedTypes: ['jump_label', 'variable_op'] },
];

// ============================================================
// 完整项目数据（编译器输入）
// ============================================================

export interface ProjectData {
  meta: ProjectMeta;
  scenes: Record<string, Scene>;
  assets: AssetEntry[];
  characters: CharacterDef[];
  variables: VariableDef[];
}

// ============================================================
// 编译器 Lint 结果
// ============================================================

export type LintSeverity = 'error' | 'warning';

export interface LintIssue {
  severity: LintSeverity;
  message: string;
  nodeId?: string;
  sceneId?: string;
  field?: string;
}

// ============================================================
// 分辨率预设
// ============================================================

export const RESOLUTION_PRESETS = [
  { label: '960x540', width: 960, height: 540 },
  { label: '1280x720', width: 1280, height: 720 },
  { label: '1920x1080', width: 1920, height: 1080 },
];

export const FONT_PRESETS = [
  'Noto Sans SC',
  'Source Han Sans CN',
  'Microsoft YaHei',
  'SimHei',
  'WenQuanYi Micro Hei',
];

// 素材白名单
export const ASSET_WHITELIST: Record<AssetType, AssetFormat[]> = {
  background: ['png', 'jpg', 'jpeg'],
  sprite: ['png', 'jpg', 'jpeg'],
  video: ['mp4', 'webm'],
  bgm: ['ogg', 'mp3', 'wav'],
  sfx: ['ogg', 'mp3', 'wav'],
  voice: ['ogg', 'mp3', 'wav'],
};

export function getAssetTypeFromFormat(format: string): AssetType | null {
  const f = format.toLowerCase() as AssetFormat;
  if (['png', 'jpg', 'jpeg'].includes(f)) return 'background'; // 默认背景，可改立绘
  if (['mp4', 'webm'].includes(f)) return 'video';
  if (['ogg', 'mp3', 'wav'].includes(f)) return 'bgm';
  return null;
}
