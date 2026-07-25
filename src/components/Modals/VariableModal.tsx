/**
 * 变量编辑弹窗 - 对应文档第四章变量系统
 * 新建变量并加入项目，校验变量名合法性。
 */
import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui';
import { useUIStore } from '@/stores/uiStore';
import { useProjectStore } from '@/stores/projectStore';
import { toast } from '@/stores/toastStore';
import type { VariableDef, VariableType } from '@/types';

const NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const TYPES: VariableType[] = ['integer', 'float', 'string', 'boolean'];

function defaultValueFor(type: VariableType): VariableDef['initialValue'] {
  switch (type) {
    case 'integer':
    case 'float':
      return 0;
    case 'string':
      return '';
    case 'boolean':
      return false;
  }
}

export function VariableModal() {
  const open = useUIStore((s) => s.showVariableModal);
  const setOpen = useUIStore((s) => s.setShowVariableModal);
  const addVariable = useProjectStore((s) => s.addVariable);
  const variables = useProjectStore((s) => s.data.variables);

  const [name, setName] = useState('');
  const [type, setType] = useState<VariableType>('integer');
  const [initialValue, setInitialValue] = useState<VariableDef['initialValue']>(0);
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState('');

  // 弹窗打开时重置
  useEffect(() => {
    if (open) {
      setName('');
      setType('integer');
      setInitialValue(0);
      setDescription('');
      setNameError('');
    }
  }, [open]);

  // 切换类型时重置初始值
  useEffect(() => {
    setInitialValue(defaultValueFor(type));
  }, [type]);

  const validateName = (val: string): string => {
    if (!val) return '变量名不能为空';
    if (!NAME_REGEX.test(val)) return '变量名须字母开头，仅含字母数字下划线';
    if (variables.some((v) => v.name === val)) return '变量名已存在';
    return '';
  };

  const handleNameChange = (val: string) => {
    setName(val);
    setNameError(validateName(val));
  };

  const handleAdd = () => {
    const err = validateName(name);
    if (err) {
      setNameError(err);
      toast.error(err);
      return;
    }
    const variable: VariableDef = {
      name,
      type,
      initialValue,
      description: description.trim() || undefined,
    };
    addVariable(variable);
    toast.success(`变量「${name}」已添加`);
    setOpen(false);
  };

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="添加变量"
      footer={
        <>
          <button className="btn-secondary" onClick={() => setOpen(false)}>
            取消
          </button>
          <button className="btn-primary" onClick={handleAdd} disabled={!!nameError || !name}>
            添加
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label">变量名</label>
          <input
            type="text"
            className="input"
            placeholder="如 trust_score"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
          />
          {nameError ? (
            <p className="text-2xs text-red-400 mt-1">{nameError}</p>
          ) : (
            <p className="text-2xs text-surface-500 mt-1">须字母开头，仅含字母数字下划线</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">类型</label>
            <select
              className="select"
              value={type}
              onChange={(e) => setType(e.target.value as VariableType)}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">初始值</label>
            {type === 'integer' || type === 'float' ? (
              <input
                type="number"
                className="input"
                step={type === 'float' ? 0.1 : 1}
                value={typeof initialValue === 'number' ? initialValue : 0}
                onChange={(e) => setInitialValue(Number(e.target.value))}
              />
            ) : type === 'string' ? (
              <input
                type="text"
                className="input"
                value={typeof initialValue === 'string' ? initialValue : ''}
                onChange={(e) => setInitialValue(e.target.value)}
              />
            ) : (
              <label className="flex items-center gap-2 text-sm text-surface-200 h-9 cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-brand-500"
                  checked={initialValue === true}
                  onChange={(e) => setInitialValue(e.target.checked)}
                />
                <span>true</span>
              </label>
            )}
          </div>
        </div>

        <div>
          <label className="label">描述（可选）</label>
          <input
            type="text"
            className="input"
            placeholder="变量用途说明"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}
