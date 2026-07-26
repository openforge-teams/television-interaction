/**
 * 编译器单元测试 - 验证各节点类型生成正确的 .rpy 代码
 */
import { describe, it, expect } from 'vitest';
import { Compiler } from '@/services/compiler';
import { lintProject } from '@/services/linter';
import { topologicalSort } from '@/services/topologicalSort';
import {
  createEmptyProjectData,
  createBackgroundNode,
  createSpriteNode,
  createDialogueNode,
  createAudioNode,
  createChoiceNode,
  createJumpLabelNode,
  createVariableOpNode,
  createScene,
} from '@/types/factory';
import type { ProjectData, AssetEntry, CharacterDef, VariableDef } from '@/types';
import { v4 as uuidv4 } from 'uuid';

function makeAsset(overrides: Partial<AssetEntry> = {}): AssetEntry {
  return {
    id: uuidv4(),
    fileName: 'bg_school.png',
    relativePath: 'images/bg_school.png',
    type: 'background',
    format: 'png',
    fileSize: 1024,
    tags: [],
    thumbnailPath: 'thumbnails/bg_school.png',
    importedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeCharacter(overrides: Partial<CharacterDef> = {}): CharacterDef {
  return {
    id: 'xiaoming',
    displayName: '小明',
    color: '#3366CC',
    voicePrefix: 'xm_',
    defaultEmotion: 'normal',
    emotions: { normal: 'asset_1' },
    ...overrides,
  };
}

function makeVariable(overrides: Partial<VariableDef> = {}): VariableDef {
  return {
    name: 'trust',
    type: 'integer',
    initialValue: 50,
    description: '信任度',
    ...overrides,
  };
}

function buildProject(overrides: Partial<ProjectData> = {}): ProjectData {
  const base = createEmptyProjectData('测试项目');
  return { ...base, ...overrides, meta: { ...base.meta, ...overrides.meta } };
}

describe('Compiler', () => {
  const compiler = new Compiler();

  it('应生成文件头和 start label', () => {
    const project = buildProject();
    const result = compiler.compileProject(project);
    expect(result.scriptRpy).toContain('label start:');
    expect(result.scriptRpy).toContain('影游工坊');
    expect(result.scriptRpy).toContain('return');
  });

  it('应正确生成 image 声明', () => {
    const asset = makeAsset({ id: 'a1', fileName: 'bg_school.png', type: 'background' });
    const project = buildProject({ assets: [asset] });
    const result = compiler.compileProject(project);
    expect(result.scriptRpy).toContain('image bg_bg_school = "images/bg_school.png"');
  });

  it('应正确生成角色 define 声明', () => {
    const char = makeCharacter();
    const project = buildProject({ characters: [char] });
    const result = compiler.compileProject(project);
    expect(result.scriptRpy).toContain('define xiaoming = Character("小明", color="#3366CC")');
  });

  it('应正确生成变量 default 声明', () => {
    const v = makeVariable();
    const project = buildProject({ variables: [v] });
    const result = compiler.compileProject(project);
    expect(result.scriptRpy).toContain('default trust = 50');
  });

  it('应正确编译背景节点', () => {
    const asset = makeAsset({ id: 'a1', fileName: 'bg_school.png', type: 'background' });
    const bg = createBackgroundNode(0, 'a1');
    bg.transition = 'dissolve';
    bg.transitionDuration = 1.5;
    const project = buildProject({ assets: [asset] });
    const sceneId = project.meta.currentSceneId!;
    project.scenes[sceneId].nodes.push(bg);
    const result = compiler.compileProject(project);
    expect(result.scriptRpy).toContain('scene bg_bg_school');
    expect(result.scriptRpy).toContain('with Dissolve(1.5)');
  });

  it('应正确编译立绘节点', () => {
    const char = makeCharacter();
    const spriteAsset = makeAsset({ id: 's1', fileName: 'xm_normal.png', type: 'sprite', characterId: 'xiaoming', emotion: 'normal' });
    const sprite = createSpriteNode(0, 'xiaoming', 'normal');
    sprite.screenPosition = 'left';
    const project = buildProject({ characters: [char], assets: [spriteAsset] });
    const sceneId = project.meta.currentSceneId!;
    project.scenes[sceneId].nodes.push(sprite);
    const result = compiler.compileProject(project);
    expect(result.scriptRpy).toContain('show xiaoming normal at left');
  });

  it('应正确编译对话节点（有说话人）', () => {
    const dialogue = createDialogueNode(0, 'xiaoming');
    dialogue.text = '你好，世界！';
    const project = buildProject();
    const sceneId = project.meta.currentSceneId!;
    project.scenes[sceneId].nodes.push(dialogue);
    const result = compiler.compileProject(project);
    expect(result.scriptRpy).toContain('xiaoming "你好，世界！"');
  });

  it('应正确编译对话节点（旁白）', () => {
    const dialogue = createDialogueNode(0, null);
    dialogue.text = '夜幕降临...';
    const project = buildProject();
    const sceneId = project.meta.currentSceneId!;
    project.scenes[sceneId].nodes.push(dialogue);
    const result = compiler.compileProject(project);
    expect(result.scriptRpy).toContain('"夜幕降临..."');
  });

  it('应正确编译音频节点（播放 BGM）', () => {
    const audioAsset = makeAsset({ id: 'au1', fileName: 'bgm_main.mp3', type: 'bgm', format: 'mp3' });
    const audio = createAudioNode(0, 'au1', 'bgm');
    audio.fadeIn = 2;
    const project = buildProject({ assets: [audioAsset] });
    const sceneId = project.meta.currentSceneId!;
    project.scenes[sceneId].nodes.push(audio);
    const result = compiler.compileProject(project);
    expect(result.scriptRpy).toContain('play music "audio/bgm_main.mp3" fadein 2');
  });

  it('应正确编译音频节点（停止音乐）', () => {
    const audio = createAudioNode(0, '', 'bgm');
    audio.action = 'stop';
    audio.fadeOut = 1.5;
    const project = buildProject();
    const sceneId = project.meta.currentSceneId!;
    project.scenes[sceneId].nodes.push(audio);
    const result = compiler.compileProject(project);
    expect(result.scriptRpy).toContain('stop music fadeout 1.5');
  });

  it('应正确编译选项节点', () => {
    const v = makeVariable();
    const targetScene = createScene('good_ending');
    const project = buildProject({ variables: [v] });
    project.scenes[targetScene.id] = targetScene;
    project.meta.sceneOrder.push(targetScene.id);
    const choice = createChoiceNode(0);
    choice.choices[0].text = '信任他';
    choice.choices[0].targetSceneId = targetScene.name;
    choice.choices[0].variableEffects = [{ variableName: 'trust', operation: 'add', value: 10 }];
    const sceneId = project.meta.currentSceneId!;
    project.scenes[sceneId].nodes.push(choice);
    const result = compiler.compileProject(project);
    expect(result.scriptRpy).toContain('menu:');
    expect(result.scriptRpy).toContain('"信任他":');
    expect(result.scriptRpy).toContain('$ trust += 10');
    expect(result.scriptRpy).toContain('jump good_ending');
  });

  it('应正确编译条件选项', () => {
    const v = makeVariable();
    const targetScene = createScene('secret_ending');
    const project = buildProject({ variables: [v] });
    project.scenes[targetScene.id] = targetScene;
    project.meta.sceneOrder.push(targetScene.id);
    const choice = createChoiceNode(0);
    choice.choices[0].text = '隐藏选项';
    choice.choices[0].targetSceneId = targetScene.name;
    choice.choices[0].condition = 'trust >= 80';
    const sceneId = project.meta.currentSceneId!;
    project.scenes[sceneId].nodes.push(choice);
    const result = compiler.compileProject(project);
    expect(result.scriptRpy).toContain('if trust >= 80:');
    expect(result.scriptRpy).toContain('jump secret_ending');
  });

  it('应正确编译跳转/标签节点', () => {
    const labelNode = createJumpLabelNode(0, 'label');
    labelNode.labelName = 'checkpoint';
    const jumpNode = createJumpLabelNode(1, 'jump');
    jumpNode.targetLabel = 'start';
    const returnNode = createJumpLabelNode(2, 'return');
    const project = buildProject();
    const sceneId = project.meta.currentSceneId!;
    project.scenes[sceneId].nodes.push(labelNode, jumpNode, returnNode);
    const result = compiler.compileProject(project);
    expect(result.scriptRpy).toContain('label checkpoint:');
    expect(result.scriptRpy).toContain('jump start');
    expect(result.scriptRpy).toContain('return');
  });

  it('应正确编译变量操作节点', () => {
    const v = makeVariable();
    const varOp = createVariableOpNode(0);
    varOp.variableName = 'trust';
    varOp.operation = 'add';
    varOp.value = 5;
    const project = buildProject({ variables: [v] });
    const sceneId = project.meta.currentSceneId!;
    project.scenes[sceneId].nodes.push(varOp);
    const result = compiler.compileProject(project);
    expect(result.scriptRpy).toContain('$ trust += 5');
  });

  it('应正确生成 options.rpy', () => {
    const project = buildProject();
    project.meta.name = '我的游戏';
    project.meta.author = '测试者';
    const result = compiler.compileProject(project);
    expect(result.optionsRpy).toContain('config.name = "我的游戏"');
    expect(result.optionsRpy).toContain('config.screen_width = 1280');
  });

  it('缺失素材应报错', () => {
    const bg = createBackgroundNode(0, 'nonexistent');
    const project = buildProject();
    const sceneId = project.meta.currentSceneId!;
    project.scenes[sceneId].nodes.push(bg);
    const result = compiler.compileProject(project);
    expect(result.issues.some((i) => i.severity === 'error' && i.message.includes('背景素材不存在'))).toBe(true);
  });

  it('未定义变量应报错', () => {
    const varOp = createVariableOpNode(0);
    varOp.variableName = 'undefined_var';
    varOp.operation = 'set';
    varOp.value = 1;
    const project = buildProject();
    const sceneId = project.meta.currentSceneId!;
    project.scenes[sceneId].nodes.push(varOp);
    const result = compiler.compileProject(project);
    expect(result.issues.some((i) => i.severity === 'error' && i.message.includes('变量未定义'))).toBe(true);
  });
});

describe('Linter', () => {
  it('应检测出未定义变量引用', () => {
    const varOp = createVariableOpNode(0);
    varOp.variableName = 'undefined_var';
    const project = buildProject();
    const sceneId = project.meta.currentSceneId!;
    project.scenes[sceneId].nodes.push(varOp);
    const issues = lintProject(project);
    expect(issues.some((i) => i.message.includes('未定义的变量: undefined_var'))).toBe(true);
  });

  it('应检测出缺失的跳转目标', () => {
    const choice = createChoiceNode(0);
    choice.choices[0].targetSceneId = 'nonexistent_scene';
    const project = buildProject();
    const sceneId = project.meta.currentSceneId!;
    project.scenes[sceneId].nodes.push(choice);
    const issues = lintProject(project);
    expect(issues.some((i) => i.message.includes('跳转目标不存在'))).toBe(true);
  });

  it('应检测出除以零', () => {
    const v = makeVariable();
    const varOp = createVariableOpNode(0);
    varOp.variableName = 'trust';
    varOp.operation = 'divide';
    varOp.value = 0;
    const project = buildProject({ variables: [v] });
    const sceneId = project.meta.currentSceneId!;
    project.scenes[sceneId].nodes.push(varOp);
    const issues = lintProject(project);
    expect(issues.some((i) => i.message.includes('除以零'))).toBe(true);
  });

  it('应检测出无效变量名', () => {
    const v = makeVariable({ name: '123invalid' });
    const project = buildProject({ variables: [v] });
    const issues = lintProject(project);
    expect(issues.some((i) => i.message.includes('变量名「123invalid」不合法'))).toBe(true);
  });

  it('合法项目不应有错误', () => {
    const v = makeVariable();
    const asset = makeAsset({ id: 'a1' });
    const bg = createBackgroundNode(0, 'a1');
    const project = buildProject({ variables: [v], assets: [asset] });
    const sceneId = project.meta.currentSceneId!;
    project.scenes[sceneId].nodes.push(bg);
    const issues = lintProject(project);
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });
});

describe('TopologicalSort', () => {
  it('应按顺序排列无依赖的场景', () => {
    const project = buildProject();
    const s1 = createScene('scene_a');
    const s2 = createScene('scene_b');
    project.scenes[s1.id] = s1;
    project.scenes[s2.id] = s2;
    project.meta.sceneOrder = [s1.id, s2.id];
    const result = topologicalSort(project);
    expect(result.sorted).toHaveLength(3); // start + 2
    expect(result.hasCycle).toBe(false);
  });

  it('应检测循环依赖', () => {
    const project = buildProject();
    const s1 = createScene('scene_a');
    const s2 = createScene('scene_b');
    project.scenes[s1.id] = s1;
    project.scenes[s2.id] = s2;
    project.meta.sceneOrder = [s1.id, s2.id];
    // s1 -> s2 (choice)
    const choice1 = createChoiceNode(0);
    choice1.choices[0].targetSceneId = s2.id;
    s1.nodes.push(choice1);
    // s2 -> s1 (choice)
    const choice2 = createChoiceNode(0);
    choice2.choices[0].targetSceneId = s1.id;
    s2.nodes.push(choice2);
    const result = topologicalSort(project);
    expect(result.hasCycle).toBe(true);
    expect(result.cycleScenes.length).toBeGreaterThan(0);
  });
});
