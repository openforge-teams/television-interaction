/**
 * 编译器服务 - 将项目数据编译为 Ren'Py .rpy 脚本
 * 对应文档第五章映射表
 */
import type {
  ProjectData,
  Scene,
  SceneNode,
  BackgroundNode,
  SpriteNode,
  DialogueNode,
  VideoNode,
  AudioNode,
  ChoiceNode,
  JumpLabelNode,
  VariableOpNode,
  AssetEntry,
  VariableDef,
  TransitionType,
  VariableOperation,
  VariableEffect,
  CharacterDef,
} from '@/types';
import { topologicalSort } from './topologicalSort';

export interface CompileResult {
  scriptRpy: string;
  optionsRpy: string;
  variablesRpy: string;
  screensRpy: string;
  issues: CompileIssue[];
}

export interface CompileIssue {
  severity: 'error' | 'warning';
  message: string;
  nodeId?: string;
  sceneId?: string;
}

const INDENT = '    ';

export class Compiler {
  private issues: CompileIssue[] = [];
  private assetMap: Map<string, AssetEntry> = new Map();
  private variableNames: Set<string> = new Set();
  private characterIds: Set<string> = new Set();
  private sceneLabels: Set<string> = new Set();
  /** 场景 ID -> 场景名的映射，用于将 targetSceneId（UUID）解析为场景名 */
  private sceneIdToName: Map<string, string> = new Map();
  /** 收集的内部 label 名（label 节点定义的） */
  private innerLabels: Set<string> = new Set();

  /**
   * 编译整个项目
   */
  compileProject(project: ProjectData): CompileResult {
    this.issues = [];
    this.innerLabels = new Set();
    this.sceneLabels = new Set();
    this.sceneIdToName = new Map();
    this.assetMap = new Map(project.assets.map((a) => [a.id, a]));
    this.variableNames = new Set(project.variables.map((v) => v.name));
    this.characterIds = new Set(project.characters.map((c) => c.id));

    // 收集所有场景 label 名，并建立 ID->name 映射
    for (const scene of Object.values(project.scenes)) {
      this.sceneLabels.add(this.sanitizeLabel(scene.name));
      this.sceneIdToName.set(scene.id, scene.name);
    }
    // start 是游戏入口 label，始终有效
    this.sceneLabels.add('start');

    // 预先收集所有场景中所有内部 label 定义，避免跨场景跳转误报
    for (const scene of Object.values(project.scenes)) {
      for (const node of scene.nodes) {
        if (node.type === 'jump_label' && (node as JumpLabelNode).subType === 'label') {
          const name = this.sanitizeLabel((node as JumpLabelNode).labelName || 'label_1');
          this.innerLabels.add(name);
        }
      }
    }

    const { sorted, hasCycle, cycleScenes } = topologicalSort(project);
    if (hasCycle) {
      this.issues.push({
        severity: 'warning',
        message: `检测到场景间可能存在循环跳转: ${cycleScenes.join(', ')}`,
      });
    }

    let rpy = '';

    // 文件头注释
    rpy += `# ============================================================\n`;
    rpy += `# 由影游工坊自动生成\n`;
    rpy += `# 项目: ${project.meta.name}\n`;
    rpy += `# 作者: ${project.meta.author || '未知'}\n`;
    rpy += `# 生成时间: ${new Date().toISOString()}\n`;
    rpy += `# ============================================================\n\n`;

    // 1. 生成 image 声明
    rpy += this.generateImageDeclarations(project);

    // 2. 生成角色 define 声明
    rpy += this.generateCharacterDeclarations(project.characters);

    // 3. 生成变量初始化 (default)
    rpy += this.generateVariableDefaults(project.variables);

    // 4. 生成游戏入口
    rpy += '\n# ===== 游戏入口 =====\n';
    const firstSceneName = sorted.length > 0 ? this.sanitizeLabel(sorted[0].name) : '';
    if (firstSceneName === 'start') {
      // 第一个场景就叫 start，直接用作入口，不再重复生成 label start
      rpy += '# 游戏从 start 场景开始\n';
    } else if (sorted.length > 0) {
      // 第一个场景不叫 start，生成入口 label 并跳转
      rpy += 'label start:\n';
      rpy += `${INDENT}jump ${firstSceneName}\n`;
    } else {
      // 无场景，生成空入口
      rpy += 'label start:\n';
      rpy += `${INDENT}# 暂无内容\n`;
      rpy += `${INDENT}return\n`;
    }

    // 5. 生成各场景脚本
    for (let i = 0; i < sorted.length; i++) {
      const isLast = i === sorted.length - 1;
      rpy += this.compileScene(sorted[i], isLast);
    }

    // 最后一个场景的 return 由 compileScene 内部处理，这里不再追加

    // 生成其他文件
    const optionsRpy = this.generateOptionsRpy(project);
    const variablesRpy = this.generateVariablesRpy(project.variables);
    const screensRpy = this.generateScreensRpy(project);

    return {
      scriptRpy: rpy,
      optionsRpy,
      variablesRpy,
      screensRpy,
      issues: this.issues,
    };
  }

  /**
   * 编译单个场景为 label
   * @param isLast 是否为最后一个场景（自动追加 return）
   */
  compileScene(scene: Scene, isLast = false): string {
    const labelName = this.sanitizeLabel(scene.name);
    let code = `\n# ===== 场景: ${scene.name} =====\n`;
    code += `label ${labelName}:\n`;

    // 按 position 排序节点，跨轨道按 trackIndex 再 position
    const sortedNodes = [...scene.nodes].sort((a, b) => {
      if (a.position !== b.position) return a.position - b.position;
      return a.trackIndex - b.trackIndex;
    });

    // 预先收集本场景内所有 label 节点的名称，避免前向跳转误报
    for (const node of sortedNodes) {
      if (node.type === 'jump_label' && (node as JumpLabelNode).subType === 'label') {
        const name = this.sanitizeLabel((node as JumpLabelNode).labelName || 'label_1');
        this.innerLabels.add(name);
      }
    }

    for (const node of sortedNodes) {
      code += this.compileNode(node, scene.id);
    }

    // 最后一个场景追加 return，其余场景允许 fall-through 到下一个 label
    if (isLast) {
      code += `${INDENT}return\n`;
    }

    return code;
  }

  /**
   * 编译单个节点
   */
  compileNode(node: SceneNode, sceneId: string): string {
    switch (node.type) {
      case 'background':
        return this.compileBackground(node, sceneId);
      case 'sprite':
        return this.compileSprite(node, sceneId);
      case 'dialogue':
        return this.compileDialogue(node, sceneId);
      case 'video':
        return this.compileVideo(node, sceneId);
      case 'audio':
        return this.compileAudio(node, sceneId);
      case 'choice':
        return this.compileChoice(node, sceneId);
      case 'jump_label':
        return this.compileJumpLabel(node, sceneId);
      case 'variable_op':
        return this.compileVariableOp(node, sceneId);
      default:
        this.issues.push({
          severity: 'error',
          message: `未知节点类型: ${(node as SceneNode).type}`,
          nodeId: (node as SceneNode).id,
          sceneId,
        });
        return '';
    }
  }

  // ===== 各节点类型编译 =====

  private compileBackground(node: BackgroundNode, sceneId: string): string {
    const asset = this.assetMap.get(node.assetId);
    if (!asset) {
      this.issues.push({
        severity: 'error',
        message: `背景素材不存在: ${node.assetId}`,
        nodeId: node.id,
        sceneId,
      });
      return `${INDENT}# [错误: 背景素材缺失]\n`;
    }
    const imageName = `bg_${this.sanitizeName(asset.fileName)}`;
    let code = `${INDENT}scene ${imageName}\n`;
    if (node.transition !== 'none') {
      code += `${INDENT}with ${this.formatTransition(node.transition, node.transitionDuration)}\n`;
    }
    return code;
  }

  private compileSprite(node: SpriteNode, sceneId: string): string {
    // 检查角色是否存在
    if (!node.characterId) {
      this.issues.push({
        severity: 'warning',
        message: '立绘节点未指定角色',
        nodeId: node.id,
        sceneId,
      });
      return `${INDENT}# [警告: 立绘节点未指定角色]\n`;
    }
    // 校验角色定义是否存在
    const charExists = this.characterIds.has(node.characterId);
    if (!charExists) {
      this.issues.push({
        severity: 'warning',
        message: `角色未定义: ${node.characterId}，生成的 show 语句可能无效`,
        nodeId: node.id,
        sceneId,
      });
    }
    if (node.visible) {
      let code = `${INDENT}show ${node.characterId}`;
      if (node.emotion) code += ` ${node.emotion}`;
      code += ` at ${this.mapPosition(node.screenPosition)}`;
      if (node.zorder) code += ` zorder ${node.zorder}`;
      code += '\n';
      if (node.enterEffect !== 'none') {
        code += `${INDENT}with ${this.mapEnterEffect(node.enterEffect)}\n`;
      }
      return code;
    } else {
      return `${INDENT}hide ${node.characterId}\n`;
    }
  }

  private compileDialogue(node: DialogueNode, sceneId: string): string {
    const escapedText = this.escapeString(node.text);
    let code = '';
    if (node.speakerId) {
      code += `${INDENT}${node.speakerId} "${escapedText}"\n`;
    } else {
      code += `${INDENT}"${escapedText}"\n`;
    }
    // 语音
    if (node.voiceAssetId) {
      const voiceAsset = this.assetMap.get(node.voiceAssetId);
      if (voiceAsset) {
        const escapedVoice = this.escapeString(voiceAsset.fileName);
        code = `${INDENT}voice "audio/${escapedVoice}"\n` + code;
      }
    }
    // 自动推进
    if (node.autoAdvance) {
      code += `${INDENT}$ renpy.pause(${node.autoAdvanceDelay})\n`;
    }
    return code;
  }

  private compileVideo(node: VideoNode, sceneId: string): string {
    const asset = this.assetMap.get(node.assetId);
    if (!asset) {
      this.issues.push({
        severity: 'error',
        message: `视频素材不存在: ${node.assetId}`,
        nodeId: node.id,
        sceneId,
      });
      return `${INDENT}# [错误: 视频素材缺失]\n`;
    }
    const escapedFileName = this.escapeString(asset.fileName);
    let code = `${INDENT}$ renpy.movie_cutscene("video/${escapedFileName}")\n`;
    return code;
  }

  private compileAudio(node: AudioNode, sceneId: string): string {
    const asset = this.assetMap.get(node.assetId);
    // pause / resume / stop 不需要素材文件
    const needsAsset = node.action === 'play';
    if (!asset && needsAsset) {
      this.issues.push({
        severity: 'error',
        message: `音频素材不存在: ${node.assetId}`,
        nodeId: node.id,
        sceneId,
      });
      return `${INDENT}# [错误: 音频素材缺失]\n`;
    }
    const fileName = asset ? this.escapeString(asset.fileName) : '';
    if (node.action === 'play') {
      if (node.audioType === 'bgm') {
        let code = `${INDENT}play music "audio/${fileName}"`;
        if (node.fadeIn > 0) code += ` fadein ${node.fadeIn}`;
        code += '\n';
        return code;
      } else if (node.audioType === 'voice') {
        let code = `${INDENT}play voice "audio/${fileName}"`;
        if (node.fadeIn > 0) code += ` fadein ${node.fadeIn}`;
        code += '\n';
        return code;
      } else {
        let code = `${INDENT}play sound "audio/${fileName}"`;
        if (node.fadeIn > 0) code += ` fadein ${node.fadeIn}`;
        code += '\n';
        return code;
      }
    } else if (node.action === 'stop') {
      if (node.audioType === 'bgm') {
        let code = `${INDENT}stop music`;
        if (node.fadeOut > 0) code += ` fadeout ${node.fadeOut}`;
        code += '\n';
        return code;
      } else if (node.audioType === 'voice') {
        let code = `${INDENT}stop voice`;
        if (node.fadeOut > 0) code += ` fadeout ${node.fadeOut}`;
        code += '\n';
        return code;
      } else {
        let code = `${INDENT}stop sound`;
        if (node.fadeOut > 0) code += ` fadeout ${node.fadeOut}`;
        code += '\n';
        return code;
      }
    } else if (node.action === 'pause') {
      const channel = node.audioType === 'bgm' ? 'music' : node.audioType;
      return `${INDENT}$ renpy.music.pause(channel='${channel}')\n`;
    } else if (node.action === 'resume') {
      const channel = node.audioType === 'bgm' ? 'music' : node.audioType;
      return `${INDENT}$ renpy.music.resume(channel='${channel}')\n`;
    }
    return '';
  }

  /**
   * 将场景 UUID 解析为可跳转的 label 名
   * 支持两种目标：场景 ID（UUID）或自定义 label 名
   */
  private resolveJumpTarget(targetIdOrName: string): string {
    // 使用 UUID 正则严格匹配，避免自定义 label 名被误判为 UUID
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidPattern.test(targetIdOrName) && this.sceneIdToName.has(targetIdOrName)) {
      return this.sanitizeLabel(this.sceneIdToName.get(targetIdOrName)!);
    }
    // 否则当作 label 名直接 sanitize
    return this.sanitizeLabel(targetIdOrName);
  }

  /**
   * 校验跳转目标是否存在（场景 label 或内部 label）
   */
  private validateJumpTarget(targetIdOrName: string, nodeId: string, sceneId: string): void {
    const label = this.resolveJumpTarget(targetIdOrName);
    if (!this.sceneLabels.has(label) && !this.innerLabels.has(label)) {
      this.issues.push({
        severity: 'warning',
        message: `跳转目标 "${targetIdOrName}" (label: ${label}) 可能不存在`,
        nodeId,
        sceneId,
      });
    }
  }

  private compileChoice(node: ChoiceNode, sceneId: string): string {
    let code = `${INDENT}menu:\n`;
    for (const choice of node.choices) {
      const escapedText = this.escapeString(choice.text);

      // 校验跳转目标
      if (choice.targetSceneId) {
        this.validateJumpTarget(choice.targetSceneId, node.id, sceneId);
      }

      // 条件选项使用 Ren'Py 行内 if 语法："选项文本" if condition:
      if (choice.condition && choice.condition.trim()) {
        code += `${INDENT}${INDENT}"${escapedText}" if ${choice.condition.trim()}:\n`;
      } else {
        code += `${INDENT}${INDENT}"${escapedText}":\n`;
      }
      code += this.compileChoiceEffects(choice.variableEffects, node.id, sceneId, 3);
      // 仅当明确指定了跳转目标时才生成 jump，否则 fall-through 退出 menu
      if (choice.targetSceneId) {
        const targetLabel = this.resolveJumpTarget(choice.targetSceneId);
        code += `${INDENT.repeat(3)}jump ${targetLabel}\n`;
      } else {
        this.issues.push({
          severity: 'warning',
          message: `选项「${choice.text}」未指定跳转目标，执行后将退出菜单`,
          nodeId: node.id,
          sceneId,
        });
      }
    }
    return code;
  }

  private compileChoiceEffects(
    effects: VariableEffect[] | undefined,
    nodeId: string,
    sceneId: string,
    depth: number
  ): string {
    let code = '';
    for (const effect of effects || []) {
      if (!this.variableNames.has(effect.variableName)) {
        this.issues.push({
          severity: 'error',
          message: `变量未定义: ${effect.variableName}`,
          nodeId,
          sceneId,
        });
      }
      // 检查除零
      if (effect.operation === 'divide' && Number(effect.value) === 0) {
        this.issues.push({
          severity: 'error',
          message: `除零错误: 变量 ${effect.variableName} 除以零`,
          nodeId,
          sceneId,
        });
        continue;
      }
      code += `${INDENT.repeat(depth)}$ ${effect.variableName} ${this.opToSymbol(effect.operation)} ${this.formatValue(effect.value)}\n`;
    }
    return code;
  }

  private compileJumpLabel(node: JumpLabelNode, sceneId: string): string {
    if (node.subType === 'label') {
      const labelName = this.sanitizeLabel(node.labelName || 'label_1');
      // 内部 label 必须在第 0 列，不能缩进（Ren'Py 语法要求）
      return `\nlabel ${labelName}:\n`;
    } else if (node.subType === 'jump') {
      if (!node.targetLabel || !node.targetLabel.trim()) {
        this.issues.push({
          severity: 'warning',
          message: '跳转节点未指定目标，将跳转到 start',
          nodeId: node.id,
          sceneId,
        });
        return `${INDENT}jump start\n`;
      }
      this.validateJumpTarget(node.targetLabel, node.id, sceneId);
      const resolvedLabel = this.resolveJumpTarget(node.targetLabel);
      return `${INDENT}jump ${resolvedLabel}\n`;
    } else if (node.subType === 'return') {
      return `${INDENT}return\n`;
    }
    return '';
  }

  private compileVariableOp(node: VariableOpNode, sceneId: string): string {
    if (!this.variableNames.has(node.variableName)) {
      this.issues.push({
        severity: 'error',
        message: `变量未定义: ${node.variableName}`,
        nodeId: node.id,
        sceneId,
      });
    }
    // 检查除零
    if (node.operation === 'divide' && Number(node.value) === 0) {
      this.issues.push({
        severity: 'error',
        message: `除零错误: 变量 ${node.variableName} 除以零`,
        nodeId: node.id,
        sceneId,
      });
      return `${INDENT}# [错误: 除零操作]\n`;
    }
    return `${INDENT}$ ${node.variableName} ${this.opToSymbol(node.operation)} ${this.formatValue(node.value)}\n`;
  }

  // ===== 辅助生成方法 =====

  private generateImageDeclarations(project: ProjectData): string {
    let code = '# ===== 图片声明 =====\n';
    const declaredNames = new Set<string>(); // 检测重名
    for (const asset of project.assets) {
      const escapedFileName = this.escapeString(asset.fileName);
      if (asset.type === 'background') {
        const name = `bg_${this.sanitizeName(asset.fileName)}`;
        if (declaredNames.has(name)) {
          this.issues.push({
            severity: 'warning',
            message: `图片声明名冲突: ${name} (素材: ${asset.fileName})`,
          });
          continue;
        }
        declaredNames.add(name);
        code += `image ${name} = "images/${escapedFileName}"\n`;
      } else if (asset.type === 'sprite') {
        if (asset.characterId && asset.emotion) {
          // 标准立绘声明：角色名 表情名
          const name = `${asset.characterId} ${asset.emotion}`;
          if (declaredNames.has(name)) {
            this.issues.push({
              severity: 'warning',
              message: `图片声明名冲突: ${name} (素材: ${asset.fileName})`,
            });
            continue;
          }
          declaredNames.add(name);
          code += `image ${name} = "images/${escapedFileName}"\n`;
        } else if (asset.characterId) {
          // 有角色名无表情名：用角色名作为基础 image 声明
          const name = asset.characterId;
          if (declaredNames.has(name)) {
            this.issues.push({
              severity: 'warning',
              message: `图片声明名冲突: ${name} (素材: ${asset.fileName})`,
            });
            continue;
          }
          declaredNames.add(name);
          code += `image ${name} = "images/${escapedFileName}"\n`;
        } else {
          // 无角色信息：用文件名生成声明
          const name = `sprite_${this.sanitizeName(asset.fileName)}`;
          if (declaredNames.has(name)) {
            this.issues.push({
              severity: 'warning',
              message: `图片声明名冲突: ${name} (素材: ${asset.fileName})`,
            });
            continue;
          }
          declaredNames.add(name);
          code += `image ${name} = "images/${escapedFileName}"\n`;
        }
      }
    }
    return code + '\n';
  }

  private generateCharacterDeclarations(characters: CharacterDef[]): string {
    let code = '# ===== 角色声明 =====\n';
    for (const char of characters) {
      const escapedName = this.escapeString(char.displayName);
      const escapedColor = this.escapeString(char.color);
      code += `define ${char.id} = Character("${escapedName}", color="${escapedColor}")\n`;
    }
    return code + '\n';
  }

  private generateVariableDefaults(variables: VariableDef[]): string {
    let code = '# ===== 变量初始化 =====\n';
    for (const v of variables) {
      code += `default ${v.name} = ${this.formatDefault(v)}\n`;
    }
    return code + '\n';
  }

  private generateOptionsRpy(project: ProjectData): string {
    const { meta } = project;
    return `# options.rpy - 由影游工坊生成
define config.name = "${this.escapeString(meta.name)}"
define config.version = "1.0"
define config.developer = True
define config.screen_width = ${meta.resolution.width}
define config.screen_height = ${meta.resolution.height}
define gui.text_font = "${meta.defaultFont}"
define gui.text_size = 22
define gui.name_text_color = "${meta.themeColor}"
`;
  }

  /**
   * variables.rpy - 保留为自定义函数/常量的扩展文件。
   * 变量初始值已由 script.rpy 中的 default 声明处理（支持存档回滚语义），
   * 不再在 init python 中重复赋值，避免覆盖存档行为。
   */
  private generateVariablesRpy(_variables: VariableDef[]): string {
    return '# variables.rpy - 由影游工坊生成\n# 变量初始值已在 script.rpy 中通过 default 声明\n# 可在此文件添加自定义 Python 函数和常量\n';
  }

  private generateScreensRpy(project: ProjectData): string {
    return `# screens.rpy - 由影游工坊生成
# 自定义界面（MVP 使用默认界面，可扩展）
screen say(who, what):
    style_prefix "say"
    window:
        id "window"
        text what id "what"
        if who:
            text who id "who"
`;
  }

  // ===== 映射辅助 =====

  /**
   * 将过渡类型映射为 Ren'Py 过渡表达式。
   * - dissolve/fade: 支持 Duration 参数
   * - pushright/wipeleft: Ren'Py 小写内置过渡，不接受 Duration 参数
   */
  private formatTransition(t: TransitionType, duration: number): string {
    switch (t) {
      case 'none':
        return 'None';
      case 'dissolve':
        return `Dissolve(${duration})`;
      case 'fade':
        // Ren'Py Fade 工厂需要 3 个参数: Fade(out_time, hold_time, in_time)
        return `Fade(${duration}, 0, ${duration})`;
      case 'pushright':
        // Ren'Py 小写内置过渡，不支持 Duration 参数
        return 'pushright';
      case 'wipeleft':
        return 'wipeleft';
      default:
        return `Dissolve(${duration})`;
    }
  }

  private mapPosition(pos: string): string {
    const map: Record<string, string> = {
      left: 'left',
      center: 'center',
      right: 'right',
      truecenter: 'truecenter',
    };
    return map[pos] || 'center';
  }

  private mapEnterEffect(effect: string): string {
    const map: Record<string, string> = {
      none: 'None',
      easein: 'easeinleft',
      easeout: 'easeoutleft',
      moveinleft: 'moveinleft',
      moveinright: 'moveinright',
    };
    return map[effect] || 'None';
  }

  private opToSymbol(op: VariableOperation): string {
    const map: Record<VariableOperation, string> = {
      set: '=',
      add: '+=',
      subtract: '-=',
      multiply: '*=',
      divide: '/=',
    };
    return map[op];
  }

  private formatDefault(v: VariableDef): string {
    switch (v.type) {
      case 'integer':
      case 'float':
        return String(v.initialValue);
      case 'string':
        return `"${this.escapeString(String(v.initialValue))}"`;
      case 'boolean':
        return v.initialValue ? 'True' : 'False';
      default:
        return 'None';
    }
  }

  private formatValue(value: number | string | boolean): string {
    if (typeof value === 'string') return `"${this.escapeString(value)}"`;
    if (typeof value === 'boolean') return value ? 'True' : 'False';
    return String(value);
  }

  private escapeString(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }

  private sanitizeName(fileName: string): string {
    return fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
  }

  private sanitizeLabel(name: string): string {
    return name.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_').toLowerCase() || 'unnamed';
  }
}

// 导出单例
export const compiler = new Compiler();
