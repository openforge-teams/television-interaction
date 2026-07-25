/**
 * 导出弹窗 - 对应文档第六章
 * 编译项目并导出 Ren'Py 工程，展示编译问题与导出进度。
 */
import { useState } from 'react';
import { Modal, Icon } from '@/components/ui';
import { useUIStore } from '@/stores/uiStore';
import { useProjectStore } from '@/stores/projectStore';
import { toast } from '@/stores/toastStore';
import { compiler, type CompileIssue } from '@/services/compiler';
import { exportRenpyProject } from '@/services/fileService';

type Platform = 'Windows' | 'macOS' | 'Linux' | 'Web';

export function ExportModal() {
  const open = useUIStore((s) => s.showExportModal);
  const setOpen = useUIStore((s) => s.setShowExportModal);
  const setExporting = useUIStore((s) => s.setExporting);
  const setExportProgress = useUIStore((s) => s.setExportProgress);

  const data = useProjectStore((s) => s.data);
  const projectPath = useProjectStore((s) => s.projectPath);

  const [platform, setPlatform] = useState<Platform>('Windows');
  const [includeSDK, setIncludeSDK] = useState(false);
  const [version, setVersion] = useState('1.0.0');
  const [issues, setIssues] = useState<CompileIssue[]>([]);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warnCount = issues.filter((i) => i.severity === 'warning').length;

  const reset = () => {
    setIssues([]);
    setProgress(0);
    setBusy(false);
  };

  const close = () => {
    if (busy) return;
    reset();
    setOpen(false);
  };

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const handleExport = async () => {
    if (busy) return;
    setBusy(true);
    setExporting(true);
    setExportProgress(0);
    setProgress(0);
    setIssues([]);

    try {
      // 1. 编译
      const result = compiler.compileProject(data);
      setIssues(result.issues);

      if (result.issues.some((i) => i.severity === 'error')) {
        const actualErrorCount = result.issues.filter((i) => i.severity === 'error').length;
        toast.error(`编译存在 ${actualErrorCount} 个错误，已停止导出`);
        setBusy(false);
        setExporting(false);
        return;
      }

      // 2. 模拟导出进度
      const steps = [
        { label: '生成脚本', pct: 25 },
        { label: '编译资源', pct: 55 },
        { label: `打包 ${platform} SDK`, pct: 85 },
        { label: '完成', pct: 100 },
      ];
      for (const step of steps) {
        await delay(400);
        setProgress(step.pct);
        setExportProgress(step.pct);
      }

      // 3. 调用文件服务导出
      const exportDir = projectPath ? `${projectPath}/export/${platform}` : `./export/${platform}`;
      await exportRenpyProject(
        data,
        result.scriptRpy,
        result.optionsRpy,
        result.variablesRpy,
        result.screensRpy,
        exportDir
      );

      toast.success(`已导出 ${platform} 工程（版本 ${version}）`);
      await delay(300);
      close();
    } catch (e) {
      toast.error('导出失败: ' + (e as Error).message);
    } finally {
      setBusy(false);
      setExporting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="导出 Ren'Py 工程"
      width="max-w-lg"
      footer={
        <>
          <button className="btn-secondary" onClick={close} disabled={busy}>
            取消
          </button>
          <button className="btn-primary" onClick={handleExport} disabled={busy}>
            <Icon name="export" size={16} /> {busy ? '导出中…' : '导出'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">目标平台</label>
            <select
              className="select"
              value={platform}
              onChange={(e) => setPlatform(e.target.value as Platform)}
              disabled={busy}
            >
              <option value="Windows">Windows</option>
              <option value="macOS">macOS</option>
              <option value="Linux">Linux</option>
              <option value="Web">Web</option>
            </select>
          </div>
          <div>
            <label className="label">版本号</label>
            <input
              type="text"
              className="input"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-surface-200 cursor-pointer">
          <input
            type="checkbox"
            className="accent-brand-500"
            checked={includeSDK}
            onChange={(e) => setIncludeSDK(e.target.checked)}
            disabled={busy}
          />
          <span>包含 Ren'Py SDK（生成可独立运行的工程）</span>
        </label>

        {/* 编译结果 */}
        {issues.length > 0 && (
          <div className="rounded-md border border-surface-700 bg-surface-900 p-2 text-xs space-y-1">
            <div className="flex gap-3">
              <span className="text-red-400">错误 {errorCount}</span>
              <span className="text-amber-400">警告 {warnCount}</span>
            </div>
            <div className="max-h-32 overflow-y-auto space-y-0.5">
              {issues.map((i, idx) => (
                <div key={idx} className="flex items-start gap-1.5">
                  <Icon
                    name={i.severity === 'error' ? 'error' : 'warn'}
                    size={12}
                    className={i.severity === 'error' ? 'text-red-400 mt-0.5 flex-shrink-0' : 'text-amber-400 mt-0.5 flex-shrink-0'}
                  />
                  <span className="text-surface-300 break-words">{i.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 进度条 */}
        {busy && (
          <div className="space-y-1">
            <div className="h-2 w-full rounded-full bg-surface-700 overflow-hidden">
              <div
                className="h-full bg-brand-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-2xs text-surface-400 text-right">{progress}%</div>
          </div>
        )}

        <p className="text-2xs text-surface-500">
          导出目录：{projectPath ? `${projectPath}/export/${platform}` : `(未设置项目路径) ./export/${platform}`}
        </p>
      </div>
    </Modal>
  );
}
