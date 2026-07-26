/**
 * 启动器窗口
 * 左侧最近项目列表（从 IndexedDB 读取），右侧新建/导入项目
 * 新建项目直接创建空项目，无需选择路径
 * 导入项目从 .yypkg ZIP 文件恢复
 */
import { useState, useEffect } from 'react';
import { Icon, Modal, EmptyState } from '@/components/ui';
import {
  getRecentProjects,
  removeRecentProject,
  loadProjectByKey,
  selectProjectFile,
  importProjectPackage,
  type RecentProject,
} from '@/services/fileService';
import { RESOLUTION_PRESETS, FONT_PRESETS } from '@/types';
import { useProjectStore } from '@/stores/projectStore';
import { toast } from '@/stores/toastStore';
import type { ProjectData } from '@/types';

interface LauncherProps {
  onEnterEditor: () => void;
}

export function Launcher({ onEnterEditor }: LauncherProps) {
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [showNewModal, setShowNewModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const refreshRecent = async () => {
    const list = await getRecentProjects();
    setRecentProjects(list);
  };

  useEffect(() => {
    refreshRecent();
  }, []);

  const handleOpenRecent = async (key: string) => {
    setLoading(true);
    try {
      const data = await loadProjectByKey(key);
      if (data) {
        useProjectStore.getState().loadProject(data);
        onEnterEditor();
        toast.success(`已打开项目: ${data.meta.name}`);
      } else {
        toast.error('项目数据不存在或已损坏');
        await removeRecentProject(key);
        refreshRecent();
      }
    } catch (e) {
      toast.error('打开项目失败: ' + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleImportProject = async () => {
    setLoading(true);
    try {
      const file = await selectProjectFile();
      if (!file) {
        setLoading(false);
        return;
      }
      const data = await importProjectPackage(file);
      if (data) {
        useProjectStore.getState().loadProject(data);
        onEnterEditor();
        toast.success(`已导入项目: ${data.meta.name}`);
        refreshRecent();
      } else {
        toast.error('导入失败：无法解析项目文件');
      }
    } catch (e) {
      toast.error('导入项目失败: ' + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveRecent = async (key: string) => {
    await removeRecentProject(key);
    refreshRecent();
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
                    key={p.key}
                    className="group flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-700 cursor-pointer transition-colors"
                    onClick={() => !loading && handleOpenRecent(p.key)}
                  >
                    <div className="w-10 h-10 rounded-md bg-surface-700 flex items-center justify-center flex-shrink-0">
                      <Icon name="folder" size={20} className="text-surface-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-surface-100 truncate">{p.name}</p>
                      <p className="text-xs text-surface-500 truncate">
                        {new Date(p.lastModified).toLocaleString('zh-CN')}
                      </p>
                    </div>
                    <button
                      className="opacity-0 group-hover:opacity-100 text-surface-500 hover:text-red-400 transition-opacity p-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveRecent(p.key);
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
            className="w-64 h-20 rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 hover:from-brand-500 hover:to-brand-700 flex flex-col items-center justify-center gap-1 transition-all shadow-lg hover:shadow-brand-500/20 disabled:opacity-50"
            onClick={() => setShowNewModal(true)}
            disabled={loading}
          >
            <Icon name="add" size={24} className="text-white" />
            <span className="text-base font-medium text-white">新建项目</span>
          </button>

          <button
            className="w-64 h-16 rounded-xl bg-surface-700 hover:bg-surface-600 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            onClick={handleImportProject}
            disabled={loading}
          >
            <Icon name="folder" size={20} className="text-surface-300" />
            <span className="text-base font-medium text-surface-200">
              {loading ? '导入中…' : '导入项目'}
            </span>
          </button>

          <div className="mt-auto text-center">
            <p className="text-xs text-surface-600">Ren'Py SDK 8.2.3</p>
          </div>
        </div>
      </div>

      <NewProjectModal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreate={() => {
          setShowNewModal(false);
          onEnterEditor();
        }}
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
  onCreate: () => void;
}) {
  const [name, setName] = useState('未命名项目');
  const [author, setAuthor] = useState('');
  const [resolution, setResolution] = useState('1280x720');
  const [font, setFont] = useState(FONT_PRESETS[0]);
  const [themeColor, setThemeColor] = useState('#3366CC');
  const [error, setError] = useState('');

  const handleCreate = () => {
    if (!/^[\w\u4e00-\u9fa5\- ]{1,50}$/.test(name)) {
      setError('项目名只能包含字母、数字、中文、连字符和空格，1-50 字符');
      return;
    }

    const [w, h] = resolution.split('x').map(Number);

    const store = useProjectStore.getState();
    store.newProject(name);
    store.updateMeta({
      author,
      resolution: { width: w, height: h },
      defaultFont: font,
      themeColor,
    });

    onCreate();
    setError('');
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
      <p className="text-2xs text-surface-500">
        项目将自动保存到浏览器，制作完成后可导出为文件。
      </p>
    </Modal>
  );
}
