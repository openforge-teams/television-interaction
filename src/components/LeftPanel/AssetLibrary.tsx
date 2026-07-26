/**
 * 素材库 - 对应文档第二章
 * 顶部搜索框 + 筛选标签，网格视图显示素材缩略图
 * 右键菜单：删除、重命名、复制路径
 * 导入素材：通过系统文件选择器选择文件并导入
 */
import { useState, useEffect } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { Icon, EmptyState } from '@/components/ui';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore, type AssetFilter } from '@/stores/uiStore';
import { toast } from '@/stores/toastStore';
import { selectFiles, importAssetFiles, removeAsset, getAssetURL2 } from '@/services/fileService';
import type { AssetEntry, AssetType } from '@/types';

const FILTER_TAGS: { id: AssetFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'background', label: '背景' },
  { id: 'sprite', label: '立绘' },
  { id: 'video', label: '视频' },
  { id: 'bgm', label: 'BGM' },
  { id: 'sfx', label: '音效' },
  { id: 'voice', label: '语音' },
];

// 素材类型对应的图标
const ASSET_TYPE_ICON: Record<AssetType, string> = {
  background: 'image',
  sprite: 'user',
  video: 'video',
  bgm: 'music',
  sfx: 'music',
  voice: 'mic',
};

const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  background: '背景',
  sprite: '立绘',
  video: '视频',
  bgm: 'BGM',
  sfx: '音效',
  voice: '语音',
};

const IMPORTABLE_TYPES: AssetType[] = [
  'background',
  'sprite',
  'video',
  'bgm',
  'sfx',
  'voice',
];

// 素材类型对应的文件扩展名过滤
const TYPE_TO_ACCEPT: Record<AssetType, string> = {
 background: '.png,.jpg,.jpeg',
 sprite: '.png,.jpg,.jpeg',
 video: '.mp4,.webm',
 bgm: '.ogg,.mp3,.wav',
 sfx: '.ogg,.mp3,.wav',
 voice: '.ogg,.mp3,.wav',
};

interface ContextMenuState {
  x: number;
  y: number;
  assetId: string;
}

// ===== 素材缩略图：从 IndexedDB 加载真实图片 =====
function AssetThumbnail({ asset }: { asset: AssetEntry }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    (async () => {
      const u = await getAssetURL2(asset.id);
      if (!cancelled) setUrl(u);
    })();
    return () => {
      cancelled = true;
    };
  }, [asset.id]);

  // 图片和视频显示真实缩略图
  const isVisual = asset.type === 'background' || asset.type === 'sprite' || asset.type === 'video';

  if (isVisual && url) {
    return (
      <div className="aspect-square overflow-hidden bg-surface-900/50 relative">
        {asset.type === 'video' ? (
          <video
            src={url}
            className="w-full h-full object-cover"
            muted
            onLoadedData={() => setLoaded(true)}
          />
        ) : (
          <img
            src={url}
            alt={asset.fileName}
            className={`w-full h-full object-cover transition-opacity ${
              loaded ? 'opacity-100' : 'opacity-0'
            }`}
            onLoad={() => setLoaded(true)}
          />
        )}
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-surface-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    );
  }

  // 非图片素材（音频等）显示图标占位
  return (
    <div className="aspect-square flex items-center justify-center bg-surface-900/50">
      <Icon
        name={ASSET_TYPE_ICON[asset.type]}
        size={36}
        className="text-surface-500"
      />
    </div>
  );
}

export function AssetLibrary() {
  const assets = useProjectStore((s) => s.data.assets);
  const addAsset = useProjectStore((s) => s.addAsset);
  const deleteAsset = useProjectStore((s) => s.deleteAsset);
  const updateAsset = useProjectStore((s) => s.updateAsset);

  const assetFilter = useUIStore((s) => s.assetFilter);
  const assetSearch = useUIStore((s) => s.assetSearch);
  const setAssetFilter = useUIStore((s) => s.setAssetFilter);
  const setAssetSearch = useUIStore((s) => s.setAssetSearch);
  const selectedAssetId = useUIStore((s) => s.selectedAssetId);
  const selectAsset = useUIStore((s) => s.selectAsset);
  const currentSceneId = useProjectStore((s) => s.data.meta.currentSceneId);
  const addNodeFromAsset = useProjectStore((s) => s.addNodeFromAsset);

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  // 重命名状态
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  // 导入下拉
  const [showImportMenu, setShowImportMenu] = useState(false);

  // 筛选：根据 assetFilter 和 assetSearch 过滤
  const filteredAssets = assets.filter((a) => {
    if (assetFilter !== 'all' && a.type !== assetFilter) return false;
    if (assetSearch && !a.fileName.toLowerCase().includes(assetSearch.toLowerCase())) {
      return false;
    }
    return true;
  });

  // 点击空白处关闭右键菜单
  useEffect(() => {
    if (!contextMenu) return;
    const handleClose = () => setContextMenu(null);
    window.addEventListener('click', handleClose);
    window.addEventListener('contextmenu', handleClose);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('contextmenu', handleClose);
    };
  }, [contextMenu]);

  const handleContextMenu = (e: ReactMouseEvent, assetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, assetId });
  };

  const handleImport = async (type: AssetType) => {
    setShowImportMenu(false);
    try {
      // 调用系统文件选择器
      const accept = TYPE_TO_ACCEPT[type];
      const files = await selectFiles(accept);
      if (!files || files.length === 0) return;

      // 导入到 IndexedDB，返回 AssetEntry 元数据
      // 传入用户选择的素材类型，确保分类正确
      const entries = await importAssetFiles(files, type);

      if (entries.length === 0) {
        toast.warning('未选中可导入的素材文件');
        return;
      }

      for (const entry of entries) {
        addAsset(entry);
      }
      toast.success(`已导入 ${entries.length} 个${ASSET_TYPE_LABEL[type]}素材`);
    } catch (e) {
      toast.error('导入素材失败: ' + (e as Error).message);
    }
  };

  const handleDelete = async (assetId: string) => {
    const asset = assets.find((a) => a.id === assetId);
    deleteAsset(assetId);
    // 同时清理 IndexedDB 中的素材 Blob
    await removeAsset(assetId);
    if (selectedAssetId === assetId) selectAsset(null);
    toast.success(`已删除素材: ${asset?.fileName ?? ''}`);
    setContextMenu(null);
  };

  const handleStartRename = (assetId: string) => {
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return;
    setRenamingId(assetId);
    setRenameValue(asset.fileName);
    setContextMenu(null);
  };

  const handleConfirmRename = () => {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      toast.warning('文件名不能为空');
      return;
    }
    // 同步更新 fileName 和 relativePath，保持一致性
    updateAsset(renamingId, {
      fileName: trimmed,
      relativePath: `assets/${renamingId}_${trimmed}`,
    });
    toast.success('已重命名');
    setRenamingId(null);
    setRenameValue('');
  };

  const handleCopyPath = (assetId: string) => {
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return;
    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(asset.relativePath)
        .then(
          () => toast.success(`已复制路径: ${asset.relativePath}`),
          () => toast.error('复制失败')
        );
    } else {
      toast.warning('当前环境不支持剪贴板访问');
    }
    setContextMenu(null);
  };

  const handleAddToScene = (assetId: string) => {
    if (!currentSceneId) {
      toast.warning('请先选择一个分镜');
      setContextMenu(null);
      return;
    }
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return;
    const nodeId = addNodeFromAsset(currentSceneId, assetId);
    if (nodeId) {
      toast.success(`已添加到分镜: ${asset.fileName}`);
    } else {
      toast.error('添加失败');
    }
    setContextMenu(null);
  };

  return (
    <div className="h-full flex flex-col">
      {/* 顶部：导入按钮 + 搜索框 + 筛选标签 */}
      <div className="p-2 border-b border-surface-700 flex-shrink-0 space-y-2">
        {/* 导入素材按钮 */}
        <div className="relative">
          <button
            className="btn-primary w-full !py-1.5 !text-xs"
            onClick={() => setShowImportMenu((v) => !v)}
          >
            <Icon name="add" size={14} /> 导入素材
          </button>
          {showImportMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowImportMenu(false)}
              />
              <div className="absolute left-0 top-full mt-1 z-50 bg-surface-700 border border-surface-600 rounded-lg shadow-xl py-1 w-full">
                {IMPORTABLE_TYPES.map((t) => (
                  <button
                    key={t}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-600"
                    onClick={() => handleImport(t)}
                  >
                    <Icon name={ASSET_TYPE_ICON[t]} size={14} />
                    {ASSET_TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* 搜索框 */}
        <input
          className="input !py-1.5 !text-xs"
          placeholder="搜索素材..."
          value={assetSearch}
          onChange={(e) => setAssetSearch(e.target.value)}
        />

        {/* 筛选标签 */}
        <div className="flex flex-wrap gap-1">
          {FILTER_TAGS.map((tag) => (
            <button
              key={tag.id}
              className={`px-2 py-0.5 rounded text-2xs font-medium transition-colors ${
                assetFilter === tag.id
                  ? 'bg-brand-600 text-white'
                  : 'bg-surface-700 text-surface-400 hover:bg-surface-600 hover:text-surface-200'
              }`}
              onClick={() => setAssetFilter(tag.id)}
            >
              {tag.label}
            </button>
          ))}
        </div>
      </div>

      {/* 网格视图 */}
      <div className="flex-1 overflow-y-auto p-2 min-h-0">
        {filteredAssets.length === 0 ? (
          <EmptyState
            icon="image"
            title={assets.length === 0 ? '暂无素材' : '无匹配素材'}
            hint={assets.length === 0 ? '点击「导入素材」开始添加' : '尝试更换筛选条件'}
          />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filteredAssets.map((asset) => (
              <div
                key={asset.id}
                className={`group relative rounded-md border cursor-pointer transition-all overflow-hidden ${
                  selectedAssetId === asset.id
                    ? 'border-brand-500 bg-brand-900/20'
                    : 'border-surface-700 bg-surface-700/40 hover:border-surface-500'
                }`}
                onClick={() => selectAsset(asset.id)}
                onContextMenu={(e) => handleContextMenu(e, asset.id)}
                title={`${asset.fileName}（拖拽到时间轴轨道添加）`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-asset-id', asset.id);
                  e.dataTransfer.setData('application/x-asset-type', asset.type);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
              >
                {/* 真实缩略图（从 IndexedDB 加载） */}
                <AssetThumbnail asset={asset} />
                {/* 类型角标 */}
                <span className="absolute top-1 left-1 px-1 py-0.5 rounded bg-black/50 text-2xs text-surface-200">
                  {ASSET_TYPE_LABEL[asset.type]}
                </span>
                {/* 文件名 */}
                <div className="px-1.5 py-1">
                  {renamingId === asset.id ? (
                    <input
                      className="w-full bg-surface-800 border border-brand-500 rounded px-1 text-2xs text-surface-100 focus:outline-none"
                      value={renameValue}
                      autoFocus
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={handleConfirmRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleConfirmRename();
                        if (e.key === 'Escape') {
                          setRenamingId(null);
                          setRenameValue('');
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <p className="text-2xs text-surface-300 truncate">
                      {asset.fileName}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          className="fixed z-[100] bg-surface-700 border border-surface-600 rounded-lg shadow-xl py-1 w-36"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-600"
            onClick={() => handleAddToScene(contextMenu.assetId)}
          >
            <Icon name="add" size={14} /> 添加到当前分镜
          </button>
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-600"
            onClick={() => handleStartRename(contextMenu.assetId)}
          >
            <Icon name="edit" size={14} /> 重命名
          </button>
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-600"
            onClick={() => handleCopyPath(contextMenu.assetId)}
          >
            <Icon name="folder" size={14} /> 复制路径
          </button>
          <div className="h-px bg-surface-600 my-1" />
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-surface-600"
            onClick={() => handleDelete(contextMenu.assetId)}
          >
            <Icon name="trash" size={14} /> 删除
          </button>
        </div>
      )}
    </div>
  );
}
