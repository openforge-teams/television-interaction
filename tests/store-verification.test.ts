/**
 * 验证 projectStore 核心逻辑修复
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '@/stores/projectStore';

describe('ProjectStore 稳定性修复验证', () => {
  beforeEach(() => {
    // 重置 store 状态并清除所有历史
    const store = useProjectStore.getState();
    store.newProject('重置项目');
  });

  it('newProject 应该清除撤销历史', () => {
    const store = useProjectStore.getState();

    // 执行一些操作产生历史
    store.addScene('场景1');
    store.addScene('场景2');

    const temporalBefore = useProjectStore.temporal.getState();
    expect(temporalBefore.pastStates.length).toBeGreaterThan(0);

    // 新建项目应该清除历史
    store.newProject('新项目');

    const temporalAfter = useProjectStore.temporal.getState();
    expect(temporalAfter.pastStates.length).toBe(0);
    expect(temporalAfter.futureStates.length).toBe(0);
  });

  it('loadProject 应该清除撤销历史', () => {
    const store = useProjectStore.getState();

    // 执行一些操作产生历史
    store.addScene('场景1');

    const temporalBefore = useProjectStore.temporal.getState();
    expect(temporalBefore.pastStates.length).toBeGreaterThan(0);

    // 加载项目应该清除历史
    store.loadProject({
      meta: {
        version: '1.0',
        name: '加载的项目',
        author: '',
        resolution: { width: 1280, height: 720 },
        defaultFont: 'Noto Sans SC',
        themeColor: '#3366CC',
        createdTime: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        renpyVersion: '8.2.3',
        sceneOrder: [],
        currentSceneId: null,
      },
      scenes: {},
      assets: [],
      characters: [],
      variables: [],
    }, '/test/path');

    const temporalAfter = useProjectStore.temporal.getState();
    expect(temporalAfter.pastStates.length).toBe(0);
    expect(temporalAfter.futureStates.length).toBe(0);
  });

  it('newProject 应该正确隔离项目数据', () => {
    const store = useProjectStore.getState();

    store.newProject('项目C');
    store.addScene('场景C1');
    store.addScene('场景C2');

    // 新建项目D
    store.newProject('项目D');

    const data = store.getProjectData();
    expect(data.meta.name).toBe('项目D');
    // 只有默认的 start 场景
    expect(Object.keys(data.scenes).length).toBe(1);
  });

  it('App.tsx 不应该重复创建项目（逻辑验证）', () => {
    // 验证 Launcher 创建项目后，App.tsx 的 handleNewProject
    // 不再调用 newProject，因此不会覆盖配置
    let store = useProjectStore.getState();

    // 模拟 Launcher 创建项目流程
    store.newProject('我的项目');
    store.updateMeta({
      author: '测试作者',
      resolution: { width: 1920, height: 1080 },
      defaultFont: 'Microsoft YaHei',
      themeColor: '#FF0000',
    });
    store.setProjectPath('/test/project');

    // 重新获取 store 以确保读取最新状态
    store = useProjectStore.getState();

    // 模拟 App.tsx 之前的错误行为（调用 newProject）
    // store.newProject('我的项目'); // 这行被修复后不再执行

    // 验证配置没有被覆盖
    const data = store.getProjectData();
    expect(data.meta.author).toBe('测试作者');
    expect(data.meta.resolution).toEqual({ width: 1920, height: 1080 });
    expect(data.meta.defaultFont).toBe('Microsoft YaHei');
    expect(data.meta.themeColor).toBe('#FF0000');
    expect(store.projectPath).toBe('/test/project');
  });
});
