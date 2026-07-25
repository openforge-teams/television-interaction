import { useState } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { Launcher } from '@/components/Launcher/Launcher';
import { EditorLayout } from '@/components/Editor/EditorLayout';
import { ToastContainer, Modal } from '@/components/ui';
import { Icon } from '@/components/ui';
import { useUIStore } from '@/stores/uiStore';

export default function App() {
  const [view, setView] = useState<'launcher' | 'editor'>('launcher');
  const newProject = useProjectStore((s) => s.newProject);
  const loadProject = useProjectStore((s) => s.loadProject);
  const showSettingsModal = useUIStore((s) => s.showSettingsModal);
  const setShowSettingsModal = useUIStore((s) => s.setShowSettingsModal);
  const meta = useProjectStore((s) => s.data.meta);
  const updateMeta = useProjectStore((s) => s.updateMeta);

  const handleNewProject = (name: string, path: string) => {
    newProject(name);
    useProjectStore.getState().setProjectPath(path);
    setView('editor');
  };

  const handleOpenProject = (data: any, path: string) => {
    loadProject(data, path);
    setView('editor');
  };

  const handleBackToLauncher = () => {
    setView('launcher');
  };

  return (
    <>
      {view === 'launcher' ? (
        <Launcher
          onNewProject={handleNewProject}
          onOpenProject={handleOpenProject}
        />
      ) : (
        <EditorLayout onBackToLauncher={handleBackToLauncher} />
      )}
      <ToastContainer />

      {/* 项目设置弹窗 */}
      <Modal
        open={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        title="项目设置"
        footer={
          <button className="btn-primary" onClick={() => setShowSettingsModal(false)}>
            <Icon name="check" size={16} /> 确定
          </button>
        }
      >
        <div>
          <label className="label">项目名称</label>
          <input
            className="input"
            value={meta.name}
            onChange={(e) => updateMeta({ name: e.target.value })}
          />
        </div>
        <div>
          <label className="label">作者</label>
          <input
            className="input"
            value={meta.author}
            onChange={(e) => updateMeta({ author: e.target.value })}
          />
        </div>
        <div>
          <label className="label">分辨率</label>
          <select
            className="select"
            value={`${meta.resolution.width}x${meta.resolution.height}`}
            onChange={(e) => {
              const [w, h] = e.target.value.split('x').map(Number);
              updateMeta({ resolution: { width: w, height: h } });
            }}
          >
            <option value="960x540">960x540</option>
            <option value="1280x720">1280x720</option>
            <option value="1920x1080">1920x1080</option>
          </select>
        </div>
        <div>
          <label className="label">默认字体</label>
          <select
            className="select"
            value={meta.defaultFont}
            onChange={(e) => updateMeta({ defaultFont: e.target.value })}
          >
            <option>Noto Sans SC</option>
            <option>Source Han Sans CN</option>
            <option>Microsoft YaHei</option>
            <option>SimHei</option>
            <option>WenQuanYi Micro Hei</option>
          </select>
        </div>
        <div>
          <label className="label">主题色</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={meta.themeColor}
              onChange={(e) => updateMeta({ themeColor: e.target.value })}
              className="h-9 w-16 rounded cursor-pointer bg-transparent border border-surface-600"
            />
            <span className="text-sm text-surface-300">{meta.themeColor}</span>
          </div>
        </div>
      </Modal>
    </>
  );
}
