/**
 * 问题面板 - 对应文档 5.4 和第八章
 * 调用 lintProject 获取问题列表，按错误/警告分组展示。
 * 点击问题项可选中对应节点。
 */
import { useMemo, useState, useCallback } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';
import { Icon } from '@/components/ui';
import { lintProject } from '@/services/linter';
import type { LintIssue } from '@/types';

export function ProblemsPanel() {
  const data = useProjectStore((s) => s.data);
  const selectNode = useUIStore((s) => s.selectNode);
  const [refreshKey, setRefreshKey] = useState(0);

  // 缓存问题列表，依赖 data 变化时重新计算
  const issues = useMemo<LintIssue[]>(() => {
    return lintProject(useProjectStore.getState().getProjectData());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, refreshKey]);

  const errors = useMemo(() => issues.filter((i) => i.severity === 'error'), [issues]);
  const warnings = useMemo(() => issues.filter((i) => i.severity === 'warning'), [issues]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const handleClick = (issue: LintIssue) => {
    if (issue.nodeId) {
      selectNode(issue.nodeId);
    }
  };

  const renderIssue = (issue: LintIssue, idx: number) => {
    const isError = issue.severity === 'error';
    return (
      <button
        key={`${issue.severity}-${idx}`}
        onClick={() => handleClick(issue)}
        className={`w-full text-left flex items-start gap-2 px-2 py-1.5 rounded text-xs hover:bg-surface-700 ${
          issue.nodeId ? 'cursor-pointer' : 'cursor-default'
        }`}
        title={issue.nodeId ? '点击选中对应节点' : ''}
      >
        <Icon
          name={isError ? 'error' : 'warn'}
          size={14}
          className={isError ? 'text-red-400 flex-shrink-0 mt-0.5' : 'text-amber-400 flex-shrink-0 mt-0.5'}
        />
        <span className="text-surface-200 break-words">{issue.message}</span>
        {issue.field && (
          <span className="text-surface-500 ml-auto flex-shrink-0">[{issue.field}]</span>
        )}
      </button>
    );
  };

  return (
    <div className="h-full flex flex-col bg-surface-800">
      <div className="flex items-center justify-between px-3 h-8 border-b border-surface-700 flex-shrink-0">
        <div className="flex items-center gap-3 text-2xs">
          <span className="flex items-center gap-1 text-red-400">
            <Icon name="error" size={12} /> {errors.length} 错误
          </span>
          <span className="flex items-center gap-1 text-amber-400">
            <Icon name="warn" size={12} /> {warnings.length} 警告
          </span>
        </div>
        <button
          className="btn-ghost !py-0.5 !px-1.5 text-2xs"
          onClick={refresh}
          title="重新检查"
        >
          <Icon name="settings" size={12} /> 刷新
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-1.5 min-h-0 space-y-2">
        {issues.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-surface-500">
            <Icon name="check" size={32} className="opacity-30 mb-2" />
            <p className="text-xs">未发现问题</p>
          </div>
        )}

        {errors.length > 0 && (
          <div>
            <div className="px-1 text-2xs font-semibold text-red-400 uppercase mb-1">
              错误
            </div>
            <div className="space-y-0.5">{errors.map(renderIssue)}</div>
          </div>
        )}

        {warnings.length > 0 && (
          <div>
            <div className="px-1 text-2xs font-semibold text-amber-400 uppercase mb-1">
              警告
            </div>
            <div className="space-y-0.5">{warnings.map(renderIssue)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
