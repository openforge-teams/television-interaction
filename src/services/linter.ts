/**
 * Lint 服务 - 编译前校验，对应文档 5.4
 * 校验：跳转目标、变量定义、条件表达式语法、素材引用、死循环
 */
import type { ProjectData, SceneNode, LintIssue } from '@/types';
import { topologicalSort } from './topologicalSort';

/** 将名称清洗为 Ren'Py 合法 label 名（与 compiler 保持一致） */
function sanitizeLabel(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_').toLowerCase() || 'unnamed';
}

/** 将 UUID 或场景名解析为 label 名（与 compiler 保持一致） */
function resolveJumpTarget(targetIdOrName: string, sceneIdToName: Map<string, string>): string {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(targetIdOrName) && sceneIdToName.has(targetIdOrName)) {
    return sanitizeLabel(sceneIdToName.get(targetIdOrName)!);
  }
  return sanitizeLabel(targetIdOrName);
}

export function lintProject(project: ProjectData): LintIssue[] {
  const issues: LintIssue[] = [];
  const variableNames = new Set(project.variables.map((v) => v.name));
  const assetIds = new Set(project.assets.map((a) => a.id));
  const characterIds = new Set(project.characters.map((c) => c.id));
  const sceneIds = new Set(Object.keys(project.scenes));
  const sceneNames = new Set(Object.values(project.scenes).map((s) => s.name));
  // 收集所有合法 label（场景名 sanitize 后 + 内部 label）
  const validLabels = new Set<string>();
  const sceneIdToName = new Map<string, string>();
  for (const scene of Object.values(project.scenes)) {
    validLabels.add(sanitizeLabel(scene.name));
    sceneIdToName.set(scene.id, scene.name);
  }
  validLabels.add('start');
  // 收集内部 label
  for (const scene of Object.values(project.scenes)) {
    for (const node of scene.nodes) {
      if (node.type === 'jump_label' && node.subType === 'label' && node.labelName) {
        validLabels.add(sanitizeLabel(node.labelName));
      }
    }
  }

  // 死循环检测：拓扑排序
  const { hasCycle, cycleScenes } = topologicalSort(project);
  if (hasCycle) {
    issues.push({
      severity: 'warning',
      message: `检测到场景间可能存在循环跳转（死循环风险）: ${cycleScenes.join(', ')}`,
    });
  }

  // 场景数限制
  const sceneCount = Object.keys(project.scenes).length;
  if (sceneCount > 200) {
    issues.push({
      severity: 'warning',
      message: `场景数 ${sceneCount} 超过 MVP 限制 200`,
    });
  }

  // 变量数限制
  if (project.variables.length > 100) {
    issues.push({
      severity: 'warning',
      message: `变量数 ${project.variables.length} 超过 MVP 限制 100`,
    });
  }

  // 遍历所有场景节点
  for (const scene of Object.values(project.scenes)) {
    if (scene.nodes.length > 500) {
      issues.push({
        severity: 'warning',
        message: `场景「${scene.name}」节点数 ${scene.nodes.length} 超过 MVP 限制 500`,
        sceneId: scene.id,
      });
    }

    for (const node of scene.nodes) {
      lintNode(node, scene.id, { variableNames, assetIds, characterIds, sceneIds, sceneNames, validLabels, sceneIdToName, issues });
    }
  }

  // 校验变量名合法性
  for (const v of project.variables) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v.name)) {
      issues.push({
        severity: 'error',
        message: `变量名「${v.name}」不合法（须字母开头，仅含字母数字下划线）`,
      });
    }
  }

  // 校验角色 ID 合法性
  for (const c of project.characters) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(c.id)) {
      issues.push({
        severity: 'error',
        message: `角色 ID「${c.id}」不合法（须字母开头，仅含字母数字下划线）`,
      });
    }
  }

  return issues;
}

interface LintContext {
  variableNames: Set<string>;
  assetIds: Set<string>;
  characterIds: Set<string>;
  sceneIds: Set<string>;
  sceneNames: Set<string>;
  validLabels: Set<string>;
  sceneIdToName: Map<string, string>;
  issues: LintIssue[];
}

function lintNode(
  node: SceneNode,
  sceneId: string,
  ctx: LintContext
): void {
  switch (node.type) {
    case 'background':
    case 'video':
      if (!ctx.assetIds.has(node.assetId)) {
        ctx.issues.push({
          severity: 'error',
          message: `素材引用不存在: ${node.assetId}`,
          nodeId: node.id,
          sceneId,
          field: 'assetId',
        });
      }
      break;

    case 'sprite':
      if (node.characterId && !ctx.characterIds.has(node.characterId)) {
        ctx.issues.push({
          severity: 'error',
          message: `角色引用不存在: ${node.characterId}`,
          nodeId: node.id,
          sceneId,
          field: 'characterId',
        });
      }
      break;

    case 'audio':
      if (node.action === 'play' && node.assetId && !ctx.assetIds.has(node.assetId)) {
        ctx.issues.push({
          severity: 'error',
          message: `音频素材引用不存在: ${node.assetId}`,
          nodeId: node.id,
          sceneId,
          field: 'assetId',
        });
      }
      break;

    case 'dialogue':
      if (node.voiceAssetId && !ctx.assetIds.has(node.voiceAssetId)) {
        ctx.issues.push({
          severity: 'warning',
          message: `语音素材引用不存在: ${node.voiceAssetId}`,
          nodeId: node.id,
          sceneId,
          field: 'voiceAssetId',
        });
      }
      if (!node.text.trim()) {
        ctx.issues.push({
          severity: 'warning',
          message: '对话内容为空',
          nodeId: node.id,
          sceneId,
          field: 'text',
        });
      }
      break;

    case 'choice':
      for (const choice of node.choices) {
        // 跳转目标校验（与 compiler 的 resolveJumpTarget 逻辑一致）
        if (choice.targetSceneId) {
          const resolvedLabel = resolveJumpTarget(choice.targetSceneId, ctx.sceneIdToName);
          if (!ctx.validLabels.has(resolvedLabel)) {
            ctx.issues.push({
              severity: 'error',
              message: `选项「${choice.text}」跳转目标不存在: ${choice.targetSceneId}`,
              nodeId: node.id,
              sceneId,
              field: 'targetSceneId',
            });
          }
        }
        // 条件表达式校验
        if (choice.condition && choice.condition.trim()) {
          if (!validateCondition(choice.condition)) {
            ctx.issues.push({
              severity: 'error',
              message: `选项「${choice.text}」条件表达式语法错误: ${choice.condition}`,
              nodeId: node.id,
              sceneId,
              field: 'condition',
            });
          }
          // 检查条件中的变量是否定义
          const varsInCond = extractVariableNames(choice.condition);
          for (const vn of varsInCond) {
            if (!ctx.variableNames.has(vn) && !['True', 'False', 'true', 'false'].includes(vn)) {
              ctx.issues.push({
                severity: 'error',
                message: `选项条件中引用了未定义的变量: ${vn}`,
                nodeId: node.id,
                sceneId,
                field: 'condition',
              });
            }
          }
        }
        // 变量效果校验
        for (const effect of choice.variableEffects || []) {
          if (!ctx.variableNames.has(effect.variableName)) {
            ctx.issues.push({
              severity: 'error',
              message: `变量效果引用了未定义的变量: ${effect.variableName}`,
              nodeId: node.id,
              sceneId,
              field: 'variableEffects',
            });
          }
          if (effect.operation === 'divide' && Number(effect.value) === 0) {
            ctx.issues.push({
              severity: 'error',
              message: `变量「${effect.variableName}」除以零`,
              nodeId: node.id,
              sceneId,
              field: 'variableEffects',
            });
          }
        }
      }
      break;

    case 'variable_op':
      if (!ctx.variableNames.has(node.variableName)) {
        ctx.issues.push({
          severity: 'error',
          message: `变量操作引用了未定义的变量: ${node.variableName}`,
          nodeId: node.id,
          sceneId,
          field: 'variableName',
        });
      }
      if (node.operation === 'divide' && Number(node.value) === 0) {
        ctx.issues.push({
          severity: 'error',
          message: `变量「${node.variableName}」除以零`,
          nodeId: node.id,
          sceneId,
        });
      }
      break;

    case 'jump_label':
      if (node.subType === 'jump') {
        if (!node.targetLabel || !node.targetLabel.trim()) {
          ctx.issues.push({
            severity: 'warning',
            message: '跳转节点未指定目标，将跳转到 start',
            nodeId: node.id,
            sceneId,
            field: 'targetLabel',
          });
        } else {
          const resolvedLabel = resolveJumpTarget(node.targetLabel, ctx.sceneIdToName);
          if (!ctx.validLabels.has(resolvedLabel)) {
            ctx.issues.push({
              severity: 'warning',
              message: `跳转目标可能不存在: ${node.targetLabel}`,
              nodeId: node.id,
              sceneId,
              field: 'targetLabel',
            });
          }
        }
      }
      break;
  }
}

/**
 * 简单条件表达式校验
 * 支持形如: trust >= 80, has_key == True, name == "abc"
 */
function validateCondition(expr: string): boolean {
  const trimmed = expr.trim();
  if (!trimmed) return true;
  // 允许的比较运算符
  const operators = ['>=', '<=', '==', '!=', '>', '<'];
  const hasOperator = operators.some((op) => trimmed.includes(op));
  if (!hasOperator) {
    // 可能是布尔变量直接判断
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed) || ['True', 'False'].includes(trimmed);
  }
  // 简单语法检查：不允许非法字符
  return /^[a-zA-Z_0-9\s"'+\-*/().><=!]+$/.test(trimmed);
}

/**
 * 从条件表达式中提取变量名
 */
function extractVariableNames(expr: string): string[] {
  const tokens = expr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
  const keywords = ['True', 'False', 'and', 'or', 'not'];
  return tokens.filter((t) => !keywords.includes(t));
}
