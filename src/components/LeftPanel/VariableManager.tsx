/**
 * 变量管理 - 对应文档第四章变量系统
 * 表格显示变量名、类型、初始值
 * 添加变量 / 删除变量
 */
import { Icon, EmptyState } from '@/components/ui';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';
import { toast } from '@/stores/toastStore';
import type { VariableType } from '@/types';

const TYPE_LABEL: Record<VariableType, string> = {
  integer: '整数',
  float: '浮点',
  string: '字符串',
  boolean: '布尔',
};

function formatInitialValue(value: number | string | boolean): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return `"${value}"`;
  return String(value);
}

export function VariableManager() {
  const variables = useProjectStore((s) => s.data.variables);
  const deleteVariable = useProjectStore((s) => s.deleteVariable);

  const setShowVariableModal = useUIStore((s) => s.setShowVariableModal);

  const handleDelete = (name: string) => {
    deleteVariable(name);
    toast.success(`已删除变量: ${name}`);
  };

  return (
    <div className="h-full flex flex-col">
      {/* 顶部：添加变量按钮 */}
      <div className="p-2 border-b border-surface-700 flex-shrink-0">
        <button
          className="btn-primary w-full !py-1.5 !text-xs"
          onClick={() => setShowVariableModal(true)}
        >
          <Icon name="add" size={14} /> 添加变量
        </button>
      </div>

      {/* 变量列表 */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {variables.length === 0 ? (
          <EmptyState icon="variable" title="暂无变量" hint="点击上方按钮添加变量" />
        ) : (
          <div className="px-2 py-1">
            {/* 表头 */}
            <div className="flex items-center gap-2 px-2 py-1.5 text-2xs font-medium text-surface-500 border-b border-surface-700">
              <div className="flex-1">名称</div>
              <div className="w-14 text-center">类型</div>
              <div className="flex-1">初始值</div>
              <div className="w-6" />
            </div>
            {/* 行 */}
            {variables.map((v) => (
              <div
                key={v.name}
                className="group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-700 border border-transparent transition-colors"
              >
                <div
                  className="flex-1 text-sm text-surface-100 truncate font-mono"
                  title={v.name}
                >
                  {v.name}
                </div>
                <div className="w-14 text-center">
                  <span className="px-1.5 py-0.5 rounded bg-surface-700 text-2xs text-surface-300">
                    {TYPE_LABEL[v.type]}
                  </span>
                </div>
                <div
                  className="flex-1 text-sm text-surface-300 truncate font-mono"
                  title={String(v.initialValue)}
                >
                  {formatInitialValue(v.initialValue)}
                </div>
                <button
                  className="opacity-0 group-hover:opacity-100 text-surface-500 hover:text-red-400 transition-opacity p-0.5 w-6 flex items-center justify-center"
                  onClick={() => handleDelete(v.name)}
                  title="删除变量"
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
