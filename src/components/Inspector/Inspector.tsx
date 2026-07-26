/**
 * 属性检查器 - 对应文档第四章
 * 根据选中的节点类型显示对应的属性编辑表单。
 * 容器高度 200px（由父布局控制），内部可滚动。
 */
import React from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';
import { EmptyState } from '@/components/ui';
import { v4 as uuidv4 } from 'uuid';
import type {
  SceneNode,
  BackgroundNode,
  SpriteNode,
  DialogueNode,
  AudioNode,
  VideoNode,
  ChoiceNode,
  JumpLabelNode,
  VariableOpNode,
  TransitionType,
  SpritePosition,
  EnterEffect,
  ExitEffect,
  ChoiceItem,
  VariableEffect,
  VariableOperation,
  VariableType,
} from '@/types';

/** 节点类型中文映射 */
const NODE_TYPE_LABELS: Record<SceneNode['type'], string> = {
  background: '背景',
  sprite: '立绘',
  dialogue: '对话',
  video: '视频',
  audio: '音频',
  choice: '选项',
  jump_label: '跳转/标签',
  variable_op: '变量',
};

// ===== 通用字段组件 =====

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-[120px]">
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-surface-200 cursor-pointer h-9">
      <input
        type="checkbox"
        className="accent-brand-500"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

// ===== 主组件 =====

export function Inspector() {
  const data = useProjectStore((s) => s.data);
  const updateNode = useProjectStore((s) => s.updateNode);
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);

  const currentSceneId = data.meta.currentSceneId;
  const currentScene = currentSceneId ? data.scenes[currentSceneId] : undefined;
  const node = currentScene?.nodes.find((n) => n.id === selectedNodeId) ?? null;

  return (
    <div className="h-full flex flex-col bg-surface-800">
      <div className="flex items-center justify-between px-3 h-8 border-b border-surface-700 flex-shrink-0">
        <span className="text-xs font-semibold text-surface-300 uppercase tracking-wide">
          属性检查器
        </span>
        {node && (
          <span className="text-2xs text-surface-500">
            {NODE_TYPE_LABELS[node.type]} · {node.id.slice(0, 8)}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 min-h-0">
        {!node ? (
          <EmptyState icon="edit" title="未选中任何节点" hint="在时间轴上点击节点以编辑属性" />
        ) : (
          <NodeForm
            node={node}
            sceneId={currentSceneId!}
            data={data}
            updateNode={updateNode}
          />
        )}
      </div>
    </div>
  );
}

// ===== 节点表单分发 =====

interface NodeFormProps {
  node: SceneNode;
  sceneId: string;
  data: ReturnType<typeof useProjectStore.getState>['data'];
  updateNode: (sceneId: string, nodeId: string, partial: Partial<SceneNode>) => void;
}

function NodeForm({ node, sceneId, data, updateNode }: NodeFormProps) {
  switch (node.type) {
    case 'background':
      return <BackgroundForm node={node} sceneId={sceneId} data={data} updateNode={updateNode} />;
    case 'sprite':
      return <SpriteForm node={node} sceneId={sceneId} data={data} updateNode={updateNode} />;
    case 'dialogue':
      return <DialogueForm node={node} sceneId={sceneId} data={data} updateNode={updateNode} />;
    case 'audio':
      return <AudioForm node={node} sceneId={sceneId} data={data} updateNode={updateNode} />;
    case 'video':
      return <VideoForm node={node} sceneId={sceneId} data={data} updateNode={updateNode} />;
    case 'choice':
      return <ChoiceForm node={node} sceneId={sceneId} data={data} updateNode={updateNode} />;
    case 'jump_label':
      return <JumpLabelForm node={node} sceneId={sceneId} updateNode={updateNode} />;
    case 'variable_op':
      return <VariableOpForm node={node} sceneId={sceneId} data={data} updateNode={updateNode} />;
    default:
      return null;
  }
}

// ===== 各节点类型表单 =====

const TRANSITIONS: TransitionType[] = ['none', 'dissolve', 'fade', 'pushright', 'wipeleft'];
const SPRITE_POSITIONS: SpritePosition[] = ['left', 'center', 'right', 'truecenter'];
const ENTER_EFFECTS: EnterEffect[] = ['none', 'easein', 'easeout', 'moveinleft', 'moveinright'];
const EXIT_EFFECTS: ExitEffect[] = ['none', 'fadeout', 'slideout'];
const VAR_OPS: VariableOperation[] = ['set', 'add', 'subtract', 'multiply', 'divide'];

function BackgroundForm({ node, sceneId, data, updateNode }: {
  node: BackgroundNode;
  sceneId: string;
  data: NodeFormProps['data'];
  updateNode: NodeFormProps['updateNode'];
}) {
  const bgAssets = data.assets.filter((a) => a.type === 'background');
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
      <Field label="背景素材">
        <select
          className="select"
          value={node.assetId}
          onChange={(e) => updateNode(sceneId, node.id, { assetId: e.target.value })}
        >
          <option value="">未选择</option>
          {bgAssets.map((a) => (
            <option key={a.id} value={a.id}>{a.fileName}</option>
          ))}
        </select>
      </Field>
      <Field label="过渡类型">
        <select
          className="select"
          value={node.transition}
          onChange={(e) => updateNode(sceneId, node.id, { transition: e.target.value as TransitionType })}
        >
          {TRANSITIONS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </Field>
      <Field label="过渡时长(秒)">
        <input
          type="number"
          className="input"
          min={0.5}
          max={5}
          step={0.1}
          value={node.transitionDuration}
          onChange={(e) => updateNode(sceneId, node.id, { transitionDuration: Number(e.target.value) })}
        />
      </Field>
      <div className="flex items-end">
        <CheckField
          label="等待过渡完成"
          checked={node.waitForTransition}
          onChange={(v) => updateNode(sceneId, node.id, { waitForTransition: v })}
        />
      </div>
    </div>
  );
}

function SpriteForm({ node, sceneId, data, updateNode }: {
  node: SpriteNode;
  sceneId: string;
  data: NodeFormProps['data'];
  updateNode: NodeFormProps['updateNode'];
}) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
      <Field label="角色">
        <select
          className="select"
          value={node.characterId}
          onChange={(e) => updateNode(sceneId, node.id, { characterId: e.target.value })}
        >
          <option value="">未选择</option>
          {data.characters.map((c) => (
            <option key={c.id} value={c.id}>{c.displayName} ({c.id})</option>
          ))}
        </select>
      </Field>
      <Field label="表情">
        <input
          type="text"
          className="input"
          value={node.emotion}
          onChange={(e) => updateNode(sceneId, node.id, { emotion: e.target.value })}
        />
      </Field>
      <Field label="位置">
        <select
          className="select"
          value={node.screenPosition}
          onChange={(e) => updateNode(sceneId, node.id, { screenPosition: e.target.value as SpritePosition })}
        >
          {SPRITE_POSITIONS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </Field>
      <Field label="进入效果">
        <select
          className="select"
          value={node.enterEffect}
          onChange={(e) => updateNode(sceneId, node.id, { enterEffect: e.target.value as EnterEffect })}
        >
          {ENTER_EFFECTS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </Field>
      <Field label="退出效果">
        <select
          className="select"
          value={node.exitEffect}
          onChange={(e) => updateNode(sceneId, node.id, { exitEffect: e.target.value as ExitEffect })}
        >
          {EXIT_EFFECTS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </Field>
      <Field label="zorder">
        <input
          type="number"
          className="input"
          value={node.zorder}
          onChange={(e) => updateNode(sceneId, node.id, { zorder: Number(e.target.value) })}
        />
      </Field>
      <div className="flex items-end">
        <CheckField
          label="可见"
          checked={node.visible}
          onChange={(v) => updateNode(sceneId, node.id, { visible: v })}
        />
      </div>
    </div>
  );
}

function DialogueForm({ node, sceneId, data, updateNode }: {
  node: DialogueNode;
  sceneId: string;
  data: NodeFormProps['data'];
  updateNode: NodeFormProps['updateNode'];
}) {
  const setTextStyle = (partial: Partial<DialogueNode['textStyle']>) =>
    updateNode(sceneId, node.id, {
      textStyle: { ...node.textStyle, ...partial },
    });

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
      <Field label="说话人">
        <select
          className="select"
          value={node.speakerId ?? ''}
          onChange={(e) => updateNode(sceneId, node.id, { speakerId: e.target.value || null })}
        >
          <option value="">旁白</option>
          {data.characters.map((c) => (
            <option key={c.id} value={c.id}>{c.displayName} ({c.id})</option>
          ))}
        </select>
      </Field>
      <Field label="字号">
        <input
          type="number"
          className="input"
          min={8}
          max={72}
          value={node.textStyle.fontSize}
          onChange={(e) => setTextStyle({ fontSize: Number(e.target.value) })}
        />
      </Field>
      <div className="col-span-2">
        <Field label="文本">
          <textarea
            className="input min-h-[48px] resize-y"
            value={node.text}
            onChange={(e) => updateNode(sceneId, node.id, { text: e.target.value })}
          />
        </Field>
      </div>
      <Field label="颜色">
        <input
          type="color"
          className="input h-9 p-1"
          value={node.textStyle.fontColor}
          onChange={(e) => setTextStyle({ fontColor: e.target.value })}
        />
      </Field>
      <Field label="对齐">
        <select
          className="select"
          value={node.textStyle.alignment}
          onChange={(e) => setTextStyle({ alignment: e.target.value as DialogueNode['textStyle']['alignment'] })}
        >
          <option value="left">left</option>
          <option value="center">center</option>
          <option value="right">right</option>
        </select>
      </Field>
      <Field label="打字机速度(字/秒,0=立即)">
        <input
          type="number"
          className="input"
          min={0}
          value={node.typewriterSpeed}
          onChange={(e) => updateNode(sceneId, node.id, { typewriterSpeed: Number(e.target.value) })}
        />
      </Field>
      <Field label="自动推进延迟(秒)">
        <input
          type="number"
          className="input"
          min={0}
          step={0.5}
          value={node.autoAdvanceDelay}
          onChange={(e) => updateNode(sceneId, node.id, { autoAdvanceDelay: Number(e.target.value) })}
        />
      </Field>
      <div className="flex items-end">
        <CheckField
          label="自动推进"
          checked={node.autoAdvance}
          onChange={(v) => updateNode(sceneId, node.id, { autoAdvance: v })}
        />
      </div>
    </div>
  );
}

function AudioForm({ node, sceneId, data, updateNode }: {
  node: AudioNode;
  sceneId: string;
  data: NodeFormProps['data'];
  updateNode: NodeFormProps['updateNode'];
}) {
  const audioAssets = data.assets.filter(
    (a) => a.type === 'bgm' || a.type === 'sfx' || a.type === 'voice'
  );
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
      <Field label="音频素材">
        <select
          className="select"
          value={node.assetId}
          onChange={(e) => updateNode(sceneId, node.id, { assetId: e.target.value })}
        >
          <option value="">未选择</option>
          {audioAssets.map((a) => (
            <option key={a.id} value={a.id}>{a.fileName}</option>
          ))}
        </select>
      </Field>
      <Field label="音频类型">
        <select
          className="select"
          value={node.audioType}
          onChange={(e) => updateNode(sceneId, node.id, { audioType: e.target.value as AudioNode['audioType'] })}
        >
          <option value="bgm">bgm</option>
          <option value="sfx">sfx</option>
          <option value="voice">voice</option>
        </select>
      </Field>
      <Field label="动作">
        <select
          className="select"
          value={node.action}
          onChange={(e) => updateNode(sceneId, node.id, { action: e.target.value as AudioNode['action'] })}
        >
          <option value="play">play</option>
          <option value="stop">stop</option>
          <option value="pause">pause</option>
          <option value="resume">resume</option>
        </select>
      </Field>
      <Field label="音量(0-100)">
        <input
          type="number"
          className="input"
          min={0}
          max={100}
          value={node.volume}
          onChange={(e) => updateNode(sceneId, node.id, { volume: Number(e.target.value) })}
        />
      </Field>
      <Field label="淡入(秒)">
        <input
          type="number"
          className="input"
          min={0}
          step={0.1}
          value={node.fadeIn}
          onChange={(e) => updateNode(sceneId, node.id, { fadeIn: Number(e.target.value) })}
        />
      </Field>
      <Field label="淡出(秒)">
        <input
          type="number"
          className="input"
          min={0}
          step={0.1}
          value={node.fadeOut}
          onChange={(e) => updateNode(sceneId, node.id, { fadeOut: Number(e.target.value) })}
        />
      </Field>
      <div className="flex items-end">
        <CheckField
          label="循环"
          checked={node.loop}
          onChange={(v) => updateNode(sceneId, node.id, { loop: v })}
        />
      </div>
    </div>
  );
}

function VideoForm({ node, sceneId, data, updateNode }: {
  node: VideoNode;
  sceneId: string;
  data: NodeFormProps['data'];
  updateNode: NodeFormProps['updateNode'];
}) {
  const videoAssets = data.assets.filter((a) => a.type === 'video');
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
      <Field label="视频素材">
        <select
          className="select"
          value={node.assetId}
          onChange={(e) => updateNode(sceneId, node.id, { assetId: e.target.value })}
        >
          <option value="">未选择</option>
          {videoAssets.map((a) => (
            <option key={a.id} value={a.id}>{a.fileName}</option>
          ))}
        </select>
      </Field>
      <Field label="播放模式">
        <select
          className="select"
          value={node.playMode}
          onChange={(e) => updateNode(sceneId, node.id, { playMode: e.target.value as VideoNode['playMode'] })}
        >
          <option value="play_and_pause">play_and_pause</option>
          <option value="play_and_continue">play_and_continue</option>
        </select>
      </Field>
      <Field label="音量(0-100)">
        <input
          type="number"
          className="input"
          min={0}
          max={100}
          value={node.volume}
          onChange={(e) => updateNode(sceneId, node.id, { volume: Number(e.target.value) })}
        />
      </Field>
      <div className="flex items-end">
        <CheckField
          label="允许跳过"
          checked={node.skipAllowed}
          onChange={(v) => updateNode(sceneId, node.id, { skipAllowed: v })}
        />
      </div>
    </div>
  );
}

function ChoiceForm({ node, sceneId, data, updateNode }: {
  node: ChoiceNode;
  sceneId: string;
  data: NodeFormProps['data'];
  updateNode: NodeFormProps['updateNode'];
}) {
  const scenes = Object.values(data.scenes);

  const updateChoice = (choiceId: string, partial: Partial<ChoiceItem>) => {
    const choices = node.choices.map((c) =>
      c.id === choiceId ? { ...c, ...partial } : c
    );
    updateNode(sceneId, node.id, { choices });
  };

  const addChoice = () => {
    const newChoice: ChoiceItem = {
      id: uuidv4(),
      text: `选项 ${node.choices.length + 1}`,
      targetSceneId: '',
      condition: '',
      variableEffects: [],
    };
    updateNode(sceneId, node.id, { choices: [...node.choices, newChoice] });
  };

  const removeChoice = (choiceId: string) => {
    updateNode(sceneId, node.id, {
      choices: node.choices.filter((c) => c.id !== choiceId),
    });
  };

  // 变量效果操作
  const addEffect = (choiceId: string) => {
    const effect: VariableEffect = {
      variableName: data.variables[0]?.name ?? '',
      operation: 'set',
      value: 0,
    };
    const choice = node.choices.find((c) => c.id === choiceId);
    if (!choice) return;
    updateChoice(choiceId, {
      variableEffects: [...(choice.variableEffects ?? []), effect],
    });
  };

  const updateEffect = (choiceId: string, idx: number, partial: Partial<VariableEffect>) => {
    const choice = node.choices.find((c) => c.id === choiceId);
    if (!choice) return;
    const effects = (choice.variableEffects ?? []).map((e, i) =>
      i === idx ? { ...e, ...partial } : e
    );
    updateChoice(choiceId, { variableEffects: effects });
  };

  const removeEffect = (choiceId: string, idx: number) => {
    const choice = node.choices.find((c) => c.id === choiceId);
    if (!choice) return;
    const effects = (choice.variableEffects ?? []).filter((_, i) => i !== idx);
    updateChoice(choiceId, { variableEffects: effects });
  };

  return (
    <div className="space-y-3">
      <Field label="布局">
        <select
          className="select"
          value={node.layout}
          onChange={(e) =>
            updateNode(sceneId, node.id, { layout: e.target.value as ChoiceNode['layout'] })
          }
        >
          <option value="vertical">vertical</option>
          <option value="horizontal">horizontal</option>
          <option value="grid">grid</option>
        </select>
      </Field>

      {node.choices.map((choice, ci) => (
        <div key={choice.id} className="rounded-md border border-surface-700 p-2 space-y-2 bg-surface-900">
          <div className="flex items-center justify-between">
            <span className="text-2xs text-surface-500">选项 {ci + 1}</span>
            <button
              className="btn-ghost !py-0.5 !px-1.5 text-red-400"
              onClick={() => removeChoice(choice.id)}
              title="删除选项"
            >
              ×
            </button>
          </div>
          <Field label="文本">
            <input
              type="text"
              className="input"
              value={choice.text}
              onChange={(e) => updateChoice(choice.id, { text: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <Field label="目标场景">
              <select
                className="select"
                value={choice.targetSceneId}
                onChange={(e) => updateChoice(choice.id, { targetSceneId: e.target.value })}
              >
                <option value="">无</option>
                {scenes.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>
            <Field label="条件(留空=无条件)">
              <input
                type="text"
                className="input"
                placeholder="如 trust >= 80"
                value={choice.condition ?? ''}
                onChange={(e) => updateChoice(choice.id, { condition: e.target.value })}
              />
            </Field>
          </div>

          {/* 变量效果 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-2xs text-surface-500">变量效果</span>
              <button
                className="btn-ghost !py-0.5 !px-1.5 text-2xs"
                onClick={() => addEffect(choice.id)}
              >
                + 添加效果
              </button>
            </div>
            <div className="space-y-1.5">
              {(choice.variableEffects ?? []).map((effect, ei) => (
                <div key={ei} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1 items-center">
                  <select
                    className="select !py-1 text-2xs"
                    value={effect.variableName}
                    onChange={(e) => updateEffect(choice.id, ei, { variableName: e.target.value })}
                  >
                    <option value="">变量</option>
                    {data.variables.map((v) => (
                      <option key={v.name} value={v.name}>{v.name}</option>
                    ))}
                  </select>
                  <select
                    className="select !py-1 text-2xs"
                    value={effect.operation}
                    onChange={(e) =>
                      updateEffect(choice.id, ei, { operation: e.target.value as VariableOperation })
                    }
                  >
                    {VAR_OPS.map((op) => (
                      <option key={op} value={op}>{op}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    className="input !py-1 text-2xs"
                    value={String(effect.value)}
                    onChange={(e) => updateEffect(choice.id, ei, { value: e.target.value })}
                  />
                  <button
                    className="btn-ghost !py-0.5 !px-1 text-red-400"
                    onClick={() => removeEffect(choice.id, ei)}
                    title="删除效果"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

      <button className="btn-secondary w-full" onClick={addChoice}>
        + 添加选项
      </button>
    </div>
  );
}

function JumpLabelForm({ node, sceneId, updateNode }: {
  node: JumpLabelNode;
  sceneId: string;
  updateNode: NodeFormProps['updateNode'];
}) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
      <div className="col-span-2">
        <Field label="子类型">
          <select
            className="select"
            value={node.subType}
            onChange={(e) =>
              updateNode(sceneId, node.id, { subType: e.target.value as JumpLabelNode['subType'] })
            }
          >
            <option value="label">label (定义标签)</option>
            <option value="jump">jump (跳转)</option>
            <option value="return">return (返回)</option>
          </select>
        </Field>
      </div>
      {node.subType === 'label' && (
        <div className="col-span-2">
          <Field label="标签名">
            <input
              type="text"
              className="input"
              value={node.labelName ?? ''}
              onChange={(e) => updateNode(sceneId, node.id, { labelName: e.target.value })}
            />
          </Field>
        </div>
      )}
      {node.subType === 'jump' && (
        <div className="col-span-2">
          <Field label="目标标签">
            <input
              type="text"
              className="input"
              placeholder="目标 label 名"
              value={node.targetLabel ?? ''}
              onChange={(e) => updateNode(sceneId, node.id, { targetLabel: e.target.value })}
            />
          </Field>
        </div>
      )}
    </div>
  );
}

function VariableOpForm({ node, sceneId, data, updateNode }: {
  node: VariableOpNode;
  sceneId: string;
  data: NodeFormProps['data'];
  updateNode: NodeFormProps['updateNode'];
}) {
  const variable = data.variables.find((v) => v.name === node.variableName);
  const varType: VariableType = variable?.type ?? 'integer';

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
      <Field label="变量名">
        <select
          className="select"
          value={node.variableName}
          onChange={(e) => {
            const v = data.variables.find((x) => x.name === e.target.value);
            updateNode(sceneId, node.id, {
              variableName: e.target.value,
              value: v ? v.initialValue : 0,
            });
          }}
        >
          <option value="">未选择</option>
          {data.variables.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name} ({v.type})
            </option>
          ))}
        </select>
      </Field>
      <Field label="操作符">
        <select
          className="select"
          value={node.operation}
          onChange={(e) =>
            updateNode(sceneId, node.id, { operation: e.target.value as VariableOperation })
          }
        >
          {VAR_OPS.map((op) => (
            <option key={op} value={op}>{op}</option>
          ))}
        </select>
      </Field>
      <div className="col-span-2">
        <Field label="值">
          {varType === 'boolean' ? (
            <CheckField
              label="true"
              checked={node.value === true || node.value === 'true'}
              onChange={(v) => updateNode(sceneId, node.id, { value: v })}
            />
          ) : varType === 'integer' || varType === 'float' ? (
            <input
              type="number"
              className="input"
              step={varType === 'float' ? 0.1 : 1}
              value={typeof node.value === 'number' ? node.value : Number(node.value) || 0}
              onChange={(e) => updateNode(sceneId, node.id, { value: Number(e.target.value) })}
            />
          ) : (
            <input
              type="text"
              className="input"
              value={typeof node.value === 'string' ? node.value : String(node.value)}
              onChange={(e) => updateNode(sceneId, node.id, { value: e.target.value })}
            />
          )}
        </Field>
      </div>
    </div>
  );
}
