/**
 * 节点工厂 - 创建各类型节点的默认实例
 */
import { v4 as uuidv4 } from 'uuid';
import type {
  SceneNode,
  BackgroundNode,
  SpriteNode,
  DialogueNode,
  VideoNode,
  AudioNode,
  ChoiceNode,
  JumpLabelNode,
  VariableOpNode,
  Scene,
  AssetEntry,
  CharacterDef,
  ProjectMeta,
  ProjectData,
} from '@/types';

export function createBackgroundNode(position: number, assetId = ''): BackgroundNode {
  return {
    id: uuidv4(),
    type: 'background',
    trackIndex: 0,
    position,
    assetId,
    transition: 'dissolve',
    transitionDuration: 1.0,
    waitForTransition: true,
  };
}

export function createSpriteNode(position: number, characterId = '', emotion = ''): SpriteNode {
  return {
    id: uuidv4(),
    type: 'sprite',
    trackIndex: 1,
    position,
    characterId,
    emotion,
    screenPosition: 'center',
    enterEffect: 'easein',
    exitEffect: 'fadeout',
    zorder: 1,
    visible: true,
  };
}

export function createDialogueNode(position: number, speakerId: string | null = null): DialogueNode {
  return {
    id: uuidv4(),
    type: 'dialogue',
    trackIndex: 2,
    position,
    speakerId,
    text: '',
    textStyle: {
      fontSize: 22,
      fontColor: '#ffffff',
      alignment: 'left',
    },
    typewriterSpeed: 0,
    autoAdvance: false,
    autoAdvanceDelay: 3,
  };
}

export function createVideoNode(position: number, assetId = ''): VideoNode {
  return {
    id: uuidv4(),
    type: 'video',
    trackIndex: 0,
    position,
    assetId,
    playMode: 'play_and_pause',
    showChoicesOverlay: false,
    skipAllowed: true,
    volume: 100,
  };
}

export function createAudioNode(position: number, assetId = '', audioType: AudioNode['audioType'] = 'bgm'): AudioNode {
  return {
    id: uuidv4(),
    type: 'audio',
    trackIndex: 3,
    position,
    assetId,
    audioType,
    loop: audioType === 'bgm',
    volume: 80,
    fadeIn: 0,
    fadeOut: 0,
    action: 'play',
  };
}

export function createChoiceNode(position: number): ChoiceNode {
  return {
    id: uuidv4(),
    type: 'choice',
    trackIndex: 4,
    position,
    choices: [
      {
        id: uuidv4(),
        text: '选项 1',
        targetSceneId: '',
        condition: '',
        variableEffects: [],
      },
    ],
    layout: 'vertical',
    buttonStyle: {
      backgroundColor: '#1e293b',
      textColor: '#ffffff',
      hoverBackgroundColor: '#334155',
      borderRadius: 8,
      fontSize: 18,
    },
  };
}

export function createJumpLabelNode(position: number, subType: JumpLabelNode['subType'] = 'label'): JumpLabelNode {
  const node: JumpLabelNode = {
    id: uuidv4(),
    type: 'jump_label',
    trackIndex: 5,
    position,
    subType,
  };
  if (subType === 'label') node.labelName = 'label_1';
  if (subType === 'jump') node.targetLabel = '';
  return node;
}

export function createVariableOpNode(position: number): VariableOpNode {
  return {
    id: uuidv4(),
    type: 'variable_op',
    trackIndex: 5,
    position,
    variableName: '',
    operation: 'set',
    value: 0,
  };
}

export function createNodeByType(type: SceneNode['type'], position: number): SceneNode {
  switch (type) {
    case 'background': return createBackgroundNode(position);
    case 'sprite': return createSpriteNode(position);
    case 'dialogue': return createDialogueNode(position);
    case 'video': return createVideoNode(position);
    case 'audio': return createAudioNode(position);
    case 'choice': return createChoiceNode(position);
    case 'jump_label': return createJumpLabelNode(position);
    case 'variable_op': return createVariableOpNode(position);
    default:
      throw new Error(`Unknown node type: ${type}`);
  }
}

/**
 * 素材类型 → 节点类型映射表
 * 用于拖拽素材到时间轴时自动创建对应节点
 */
export const ASSET_TO_NODE_TYPE: Record<AssetEntry['type'], SceneNode['type']> = {
  background: 'background',
  sprite: 'sprite',
  video: 'video',
  bgm: 'audio',
  sfx: 'audio',
  voice: 'audio',
};

/**
 * 判断素材类型是否可以被拖入指定轨道
 */
export function canAssetDropOnTrack(
  assetType: AssetEntry['type'],
  acceptedTypes: SceneNode['type'][]
): boolean {
  const nodeType = ASSET_TO_NODE_TYPE[assetType];
  return acceptedTypes.includes(nodeType);
}

/**
 * 从素材创建节点（拖拽素材到轨道时使用）
 * 会自动填充 assetId、characterId、audioType 等字段
 */
export function createNodeFromAsset(asset: AssetEntry, position: number): SceneNode {
  switch (asset.type) {
    case 'background':
      return { ...createBackgroundNode(position, asset.id) };
    case 'sprite':
      return {
        ...createSpriteNode(position, asset.characterId ?? '', asset.emotion ?? ''),
      };
    case 'video':
      return { ...createVideoNode(position, asset.id) };
    case 'bgm':
      return { ...createAudioNode(position, asset.id, 'bgm') };
    case 'sfx':
      return { ...createAudioNode(position, asset.id, 'sfx') };
    case 'voice':
      return { ...createAudioNode(position, asset.id, 'voice') };
    default:
      throw new Error(`Cannot create node from asset type: ${asset.type}`);
  }
}

export function createScene(name: string): Scene {
  return {
    id: uuidv4(),
    name,
    nodes: [],
    color: '#3b82f6',
  };
}

export function createDefaultProjectMeta(name: string): ProjectMeta {
  const now = new Date().toISOString();
  return {
    version: '1.0',
    name,
    author: '',
    resolution: { width: 1280, height: 720 },
    defaultFont: 'Noto Sans SC',
    themeColor: '#3366CC',
    createdTime: now,
    lastModified: now,
    renpyVersion: '8.2.3',
    sceneOrder: [],
    currentSceneId: null,
  };
}

export function createEmptyProjectData(name: string): ProjectData {
  const startScene = createScene('start');
  const meta = createDefaultProjectMeta(name);
  meta.sceneOrder = [startScene.id];
  meta.currentSceneId = startScene.id;
  return {
    meta,
    scenes: { [startScene.id]: startScene },
    assets: [],
    characters: [],
    variables: [],
  };
}
