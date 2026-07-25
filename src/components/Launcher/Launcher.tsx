/**
 * 启动器窗口 - 对应文档 2.1
 * 800x600 居中显示，左侧最近项目列表，右侧新建/打开按钮
 */
import { useState, useEffect } from 'react';
import { Icon, Modal, EmptyState } from '@/components/ui';
import { getRecentProjects, removeRecentProject, loadProject, selectFolder } from '@/services/fileService';
import type { RecentProject } from '@/services/fileService';
import { RESOLUTION_PRESETS, FONT_PRESETS } from '@/types';
import { createDefaultProjectMeta } from '@/types/factory';
import { useProjectStore } from '@/stores/projectStore';
import { toast } from '@/stores/toastStore';
import { v4 as uuidv4 } from 'uuid';
import type { ProjectData } from '@/types';

interface LauncherProps {
  onNewProject: (name: string, path: string) => void;
  onOpenProject: (data: ProjectData, path: string) => void;
}

export function Launcher({ onNewProject, onOpenProject }: LauncherProps) {
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [showNewModal, setShowNewModal] = useState(false);

  useEffect(() => {
    setRecentProjects(getRecentProjects());
  }, []);

  const handleOpenRecent = async (path: string) => {
    try {
      const data = await loadProject(path);
      if (data) {
        onOpenProject(data, path);
        toast.success(`已打开项目: ${data.meta.name}`);
      } else {
        toast.error('项目文件不存在或已损坏');
        removeRecentProject(path);
        setRecentProjects(getRecentProjects());
      }
    } catch (e) {
      toast.error('打开项目失败: ' + (e as Error).message);
    }
  };

  return (
    <div className="h-full w-full flex flex-col bg-surface-900">
      {/* 顶部标题栏 */}
      <div className="h-12 flex items-center px-6 border-b border-surface-700 bg-surface-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
            <Icon name="video" size={18} className="text-white" />
          </div>
          <span className="text-base font-semibold text-surface-100">影游工坊</span>
          <span className="text-xs text-surface-500 ml-1">MVP v1.0</span>
        </div>
      </div>

      {/* 主体 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：最近项目 */}
        <div className="w-1/2 border-r border-surface-700 flex flex-col">
          <div className="px-6 py-4 flex items-center justify-between">
            <h2 className="text-sm font-medium text-surface-300">最近项目</h2>
            {recentProjects.length > 0 && (
              <span className="text-xs text-surface-500">{recentProjects.length} 个项目</span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-4">
            {recentProjects.length === 0 ? (
              <EmptyState icon="folder" title="暂无最近项目" hint="点击右侧「新建项目」开始创作" />
            ) : (
              <div className="space-y-1">
                {recentProjects.map((p) => (
                  <div
                    key={p.path}
                    className="group flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-700 cursor-pointer transition-colors"
                    onClick={() => handleOpenRecent(p.path)}
                  >
                    <div className="w-10 h-10 rounded-md bg-surface-700 flex items-center justify-center flex-shrink-0">
                      <Icon name="folder" size={20} className="text-surface-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-surface-100 truncate">{p.name}</p>
                      <p className="text-xs text-surface-500 truncate">{p.path}</p>
                    </div>
                    <span className="text-xs text-surface-500 flex-shrink-0">
                      {new Date(p.lastModified).toLocaleDateString('zh-CN')}
                    </span>
                    <button
                      className="opacity-0 group-hover:opacity-100 text-surface-500 hover:text-red-400 transition-opacity p-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeRecentProject(p.path);
                        setRecentProjects(getRecentProjects());
                      }}
                    >
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 右侧：操作区 */}
        <div className="w-1/2 flex flex-col items-center justify-center gap-6 p-8">
          <div className="text-center mb-4">
            <h1 className="text-2xl font-bold text-surface-100 mb-2">影视互动游戏编辑器</h1>
            <p className="text-sm text-surface-400">零代码拖拽式创作，基于 Ren'Py 8.x 引擎</p>
          </div>

          <button
            className="w-64 h-20 rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 hover:from-brand-500 hover:to-brand-700 flex flex-col items-center justify-center gap-1 transition-all shadow-lg hover:shadow-brand-500/20"
            onClick={() => setShowNewModal(true)}
          >
            <Icon name="add" size={24} className="text-white" />
            <span className="text-base font-medium text-white">新建项目</span>
          </button>

          <button
            className="w-64 h-16 rounded-xl bg-surface-700 hover:bg-surface-600 flex items-center justify-center gap-2 transition-colors"
            onClick={async () => {
              const path = await selectFolder();
              if (path) {
                try {
                  const data = await loadProject(path);
                  if (data) {
                    onOpenProject(data, path);
                  } else {
                    toast.warning('该路径下未找到项目');
                  }
                } catch (e) {
                  toast.error('打开失败: ' + (e as Error).message);
                }
              }
            }}
          >
            <Icon name="folder" size={20} className="text-surface-300" />
            <span className="text-base font-medium text-surface-200">打开项目</span>
          </button>

          <div className="mt-auto text-center">
            <p className="text-xs text-surface-600">Ren'Py SDK 8.2.3</p>
          </div>
        </div>
      </div>

      <NewProjectModal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreate={onNewProject}
      />
    </div>
  );
}

// ===== 新建项目弹窗 =====
function NewProjectModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, path: string) => void;
}) {
  const [name, setName] = useState('未命名项目');
  const [author, setAuthor] = useState('');
  const [resolution, setResolution] = useState('1280x720');
  const [font, setFont] = useState(FONT_PRESETS[0]);
  const [themeColor, setThemeColor] = useState('#3366CC');
  const [savePath, setSavePath] = useState('');
  const [error, setError] = useState('');

  const handleSelectFolder = async () => {
    const path = await selectFolder();
    if (path) setSavePath(path);
  };

  const handleCreate = () => {
    // 验证项目名
    if (!/^[\w\u4e00-\u9fa5\- ]{1,50}$/.test(name)) {
      setError('项目名只能包含字母、数字、中文、连字符和空格，1-50 字符');
      return;
    }
    if (!savePath) {
      setError('请选择保存路径');
      return;
    }

    // 创建项目元数据并初始化
    const meta = createDefaultProjectMeta(name);
    meta.author = author;
    const [w, h] = resolution.split('x').map(Number);
    meta.resolution = { width: w, height: h };
    meta.defaultFont = font;
    meta.themeColor = themeColor;

    // 使用 store 创建项目
    const store = useProjectStore.getState();
    store.newProject(name);
    // 应用设置
    store.updateMeta({
      author,
      resolution: { width: w, height: h },
      defaultFont: font,
      themeColor,
    });
    store.setProjectPath(savePath);

    onCreate(name, savePath);
    setError('');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="新建项目"
      width="max-w-lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={handleCreate}>
            <Icon name="check" size={16} /> 创建
          </button>
        </>
      }
    >
      {error && (
        <div className="flex items-center gap-2 rounded-md bg-red-900/40 border border-red-700 px-3 py-2 text-sm text-red-300">
          <Icon name="warn" size={16} />
          {error}
        </div>
      )}
      <div>
        <label className="label">项目名称 *</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="未命名项目"
        />
      </div>
      <div>
        <label className="label">作者</label>
        <input
          className="input"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="可选"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">分辨率</label>
          <select className="select" value={resolution} onChange={(e) => setResolution(e.target.value)}>
            {RESOLUTION_PRESETS.map((r) => (
              <option key={r.label} value={r.label}>{r.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">默认字体</label>
          <select className="select" value={font} onChange={(e) => setFont(e.target.value)}>
            {FONT_PRESETS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label">主题色</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={themeColor}
            onChange={(e) => setThemeColor(e.target.value)}
            className="h-9 w-16 rounded cursor-pointer bg-transparent border border-surface-600"
          />
          <span className="text-sm text-surface-300">{themeColor}</span>
        </div>
      </div>
      <div>
        <label className="label">保存路径 *</label>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            value={savePath}
            readOnly
            placeholder="点击右侧选择文件夹..."
          />
          <button className="btn-secondary" onClick={handleSelectFolder}>
            <Icon name="folder" size={16} /> 浏览
          </button>
        </div>
      </div>
    </Modal>
  );
}
