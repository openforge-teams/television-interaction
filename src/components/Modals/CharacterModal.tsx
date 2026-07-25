/**
 * 角色编辑弹窗 - 对应文档第三章
 * 新建角色定义并加入项目，校验角色 ID 合法性。
 */
import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui';
import { useUIStore } from '@/stores/uiStore';
import { useProjectStore } from '@/stores/projectStore';
import { toast } from '@/stores/toastStore';
import type { CharacterDef } from '@/types';

const ID_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function CharacterModal() {
  const open = useUIStore((s) => s.showCharacterModal);
  const setOpen = useUIStore((s) => s.setShowCharacterModal);
  const addCharacter = useProjectStore((s) => s.addCharacter);
  const characters = useProjectStore((s) => s.data.characters);

  const [id, setId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [voicePrefix, setVoicePrefix] = useState('');
  const [defaultEmotion, setDefaultEmotion] = useState('normal');
  const [idError, setIdError] = useState('');

  useEffect(() => {
    if (open) {
      setId('');
      setDisplayName('');
      setColor('#3b82f6');
      setVoicePrefix('');
      setDefaultEmotion('normal');
      setIdError('');
    }
  }, [open]);

  const validateId = (val: string): string => {
    if (!val) return '角色 ID 不能为空';
    if (!ID_REGEX.test(val)) return '角色 ID 须字母开头，仅含字母数字下划线';
    if (characters.some((c) => c.id === val)) return '角色 ID 已存在';
    return '';
  };

  const handleIdChange = (val: string) => {
    setId(val);
    setIdError(validateId(val));
  };

  const handleAdd = () => {
    const err = validateId(id);
    if (err) {
      setIdError(err);
      toast.error(err);
      return;
    }
    const character: CharacterDef = {
      id,
      displayName: displayName.trim() || id,
      color,
      voicePrefix: voicePrefix.trim(),
      defaultEmotion: defaultEmotion.trim() || 'normal',
      emotions: {},
    };
    addCharacter(character);
    toast.success(`角色「${character.displayName}」已添加`);
    setOpen(false);
  };

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="添加角色"
      footer={
        <>
          <button className="btn-secondary" onClick={() => setOpen(false)}>
            取消
          </button>
          <button className="btn-primary" onClick={handleAdd} disabled={!!idError || !id}>
            添加
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label">角色 ID</label>
          <input
            type="text"
            className="input"
            placeholder="如 alice"
            value={id}
            onChange={(e) => handleIdChange(e.target.value)}
          />
          {idError ? (
            <p className="text-2xs text-red-400 mt-1">{idError}</p>
          ) : (
            <p className="text-2xs text-surface-500 mt-1">须字母开头，仅含字母数字下划线</p>
          )}
        </div>

        <div>
          <label className="label">显示名</label>
          <input
            type="text"
            className="input"
            placeholder="如 爱丽丝"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">颜色</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="input h-9 w-12 p-1 flex-shrink-0"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
              <span className="text-sm text-surface-300 font-mono">{color}</span>
            </div>
          </div>
          <div>
            <label className="label">语音前缀</label>
            <input
              type="text"
              className="input"
              placeholder="如 alice_voice_"
              value={voicePrefix}
              onChange={(e) => setVoicePrefix(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="label">默认表情</label>
          <input
            type="text"
            className="input"
            placeholder="如 normal"
            value={defaultEmotion}
            onChange={(e) => setDefaultEmotion(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}
