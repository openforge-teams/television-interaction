/**
 * 画布实时预览 - 对应文档 4.4
 * 使用 PixiJS 8.x 渲染当前场景节点的可视化预览。
 * 从 IndexedDB 加载真实素材图片，找不到时使用占位矩形。
 */
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Application, Container, Graphics, Text, Sprite, Texture, Assets } from 'pixi.js';
import { useProjectStore } from '@/stores/projectStore';
import { getAssetURL2 } from '@/services/fileService';
import type {
  BackgroundNode,
  SpriteNode,
  DialogueNode,
  ChoiceNode,
  CharacterDef,
} from '@/types';

/** 将 hex 字符串转为 PixiJS 可用的数字颜色 */
function hexToNumber(hex: string, fallback = 0x3366cc): number {
  if (!hex) return fallback;
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{3,8}$/.test(clean)) return fallback;
  return parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
}

/** 立绘水平位置 -> 画布 X 比例 */
const SPRITE_X_RATIO: Record<string, number> = {
  left: 0.25,
  center: 0.5,
  right: 0.75,
  truecenter: 0.5,
};

export function CanvasPreview() {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const stageRef = useRef<Container | null>(null);
  const [appReady, setAppReady] = useState(false);

  const data = useProjectStore((s) => s.data);
  const currentSceneId = data.meta.currentSceneId;
  const resolution = data.meta.resolution;
  const characters = data.characters;
  const assets = data.assets;
  const themeColor = data.meta.themeColor;

  // 使用 useMemo 避免每次渲染生成新的 nodes 引用导致 useEffect 无限循环
  const nodes = useMemo(() => {
    if (!currentSceneId) return [];
    const scene = data.scenes[currentSceneId];
    return scene?.nodes ?? [];
  }, [data.scenes, currentSceneId]);

  // ===== 初始化 PixiJS（仅在挂载时执行一次） =====
  useEffect(() => {
    let destroyed = false;
    let app: Application | null = null;

    (async () => {
      // 延迟一帧，避免 StrictMode 双重挂载导致竞态
      await new Promise((r) => setTimeout(r, 0));
      if (destroyed) return;

      app = new Application();
      await app.init({
        width: resolution.width,
        height: resolution.height,
        background: '#0f172a',
        antialias: true,
        resizeTo: undefined,
      });
      if (destroyed) {
        app.destroy(true, { children: true });
        return;
      }
      const canvas = app.canvas;
      canvas.style.display = 'block';
      if (containerRef.current) {
        containerRef.current.appendChild(canvas);
      }
      const stage = new Container();
      stage.sortableChildren = true;
      app.stage.addChild(stage);
      appRef.current = app;
      stageRef.current = stage;
      setAppReady(true);
    })().catch((e) => {
      console.error('PixiJS init failed', e);
    });

    return () => {
      destroyed = true;
      if (app) {
        try { app.destroy(true, { children: true }); } catch { /* noop */ }
      }
      // 清理纹理缓存，防止 GPU 内存泄漏
      textureCacheRef.current.forEach((texture) => {
        try { texture.destroy(true); } catch { /* noop */ }
      });
      textureCacheRef.current.clear();
      appRef.current = null;
      stageRef.current = null;
      setAppReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== 分辨率变化 -> 重建渲染尺寸 =====
  useEffect(() => {
    const app = appRef.current;
    if (app && appReady) {
      app.renderer.resize(resolution.width, resolution.height);
    }
  }, [resolution.width, resolution.height, appReady]);

  // ===== 画布等比缩放适应容器 =====
  useEffect(() => {
    const container = containerRef.current;
    const app = appRef.current;
    if (!container || !app || !appReady) return;

    const update = () => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (cw === 0 || ch === 0) return;
      const scale = Math.min(cw / resolution.width, ch / resolution.height);
      const canvas = app.canvas;
      canvas.style.width = `${Math.floor(resolution.width * scale)}px`;
      canvas.style.height = `${Math.floor(resolution.height * scale)}px`;
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(container);
    return () => ro.disconnect();
  }, [resolution.width, resolution.height, appReady]);

  // ===== 纹理缓存：assetId -> Texture =====
  const textureCacheRef = useRef<Map<string, Texture>>(new Map());
  const [textureVersion, setTextureVersion] = useState(0);

  // 预加载当前场景中引用的素材纹理
  useEffect(() => {
    let cancelled = false;
    const cache = textureCacheRef.current;
    const assetIds = new Set<string>();

    // 收集需要加载的 assetId
    for (const node of nodes) {
      if (node.type === 'background') {
        if (node.assetId) assetIds.add(node.assetId);
      } else if (node.type === 'sprite') {
        // 立绘通过 characterId + emotion 查找素材
        const asset = assets.find(
          (a) => a.characterId === node.characterId && a.emotion === node.emotion
        );
        if (asset) assetIds.add(asset.id);
      }
    }

    // 清理不再需要的纹理（切换场景时释放旧纹理）
    const toRemove: string[] = [];
    cache.forEach((texture, key) => {
      if (!assetIds.has(key)) {
        try { texture.destroy(true); } catch { /* noop */ }
        toRemove.push(key);
      }
    });
    for (const key of toRemove) cache.delete(key);

    // 只加载未缓存的
    const toLoad = Array.from(assetIds).filter((id) => !cache.has(id));
    if (toLoad.length === 0) return;

    (async () => {
      for (const assetId of toLoad) {
        const url = await getAssetURL2(assetId);
        if (!url || cancelled) continue;
        try {
          const texture = await Assets.load(url);
          if (cancelled) break;
          cache.set(assetId, texture);
        } catch {
          // 加载失败，跳过
        }
      }
      if (!cancelled) setTextureVersion((v) => v + 1);
    })();

    return () => {
      cancelled = true;
    };
  }, [nodes, assets]);

  // ===== 节点变化重新渲染 =====
  // 使用 useCallback 稳定化 drawScene 引用
  const drawScene = useCallback(() => {
    const stage = stageRef.current;
    const app = appRef.current;
    if (!stage || !app) return;
    // 销毁旧子元素以防止 GPU 内存泄漏
    const removed = stage.removeChildren();
    removed.forEach((child) => {
      try { child.destroy(); } catch { /* noop */ }
    });

    const W = resolution.width;
    const H = resolution.height;

    const sorted = [...nodes].sort((a, b) => {
      if (a.position !== b.position) return a.position - b.position;
      return a.trackIndex - b.trackIndex;
    });

    for (const node of sorted) {
      switch (node.type) {
        case 'background':
          drawBackground(node, W, H);
          break;
        case 'sprite':
          drawSprite(node, W, H);
          break;
        case 'dialogue':
          drawDialogue(node, W, H);
          break;
        case 'choice':
          drawChoice(node, W, H);
          break;
        default:
          break;
      }
    }
  }, [nodes, characters, assets, themeColor, resolution, textureVersion]);

  useEffect(() => {
    if (!appReady) return;
    drawScene();
  }, [drawScene, appReady]);

  /** 查找角色定义 */
  function getCharacter(id: string): CharacterDef | undefined {
    return characters.find((c) => c.id === id);
  }

  /** 背景：优先使用真实图片，否则使用主题色占位 */
  function drawBackground(node: BackgroundNode, W: number, H: number) {
    const stage = stageRef.current;
    if (!stage) return;
    const asset = assets.find((a) => a.id === node.assetId);
    const texture = asset ? textureCacheRef.current.get(asset.id) : null;

    if (texture) {
      // 真实图片背景：等比缩放铺满
      const sprite = new Sprite(texture);
      const scale = Math.max(W / texture.width, H / texture.height);
      sprite.width = texture.width * scale;
      sprite.height = texture.height * scale;
      sprite.x = (W - sprite.width) / 2;
      sprite.y = (H - sprite.height) / 2;
      sprite.zIndex = 0;
      stage.addChild(sprite);
    } else {
      // 占位：主题色矩形
      const g = new Graphics();
      g.rect(0, 0, W, H).fill({ color: hexToNumber(themeColor, 0x3366cc) });
      g.zIndex = 0;
      stage.addChild(g);
    }

    // 素材名标签
    const label = new Text({
      text: `背景: ${asset?.fileName ?? '未指定'}`,
      style: { fill: 0xffffff, fontSize: 16, fontFamily: 'sans-serif' },
    });
    label.x = 16;
    label.y = 16;
    label.zIndex = 1;
    stage.addChild(label);
  }

  /** 立绘：优先使用真实图片，否则使用占位矩形，带角色颜色边框 */
  function drawSprite(node: SpriteNode, W: number, H: number) {
    const stage = stageRef.current;
    if (!stage) return;
    if (!node.visible) return;
    const char = getCharacter(node.characterId);
    const borderColor = hexToNumber(char?.color ?? '#94a3b8', 0x94a3b8);

    // 查找立绘素材
    const asset = assets.find(
      (a) => a.characterId === node.characterId && a.emotion === node.emotion
    );
    const texture = asset ? textureCacheRef.current.get(asset.id) : null;

    if (texture) {
      // 真实立绘图片
      const sprite = new Sprite(texture);
      const targetH = Math.floor(H * 0.78);
      const scale = targetH / texture.height;
      sprite.width = texture.width * scale;
      sprite.height = targetH;
      const xRatio = SPRITE_X_RATIO[node.screenPosition] ?? 0.5;
      sprite.x = Math.floor(W * xRatio - sprite.width / 2);
      sprite.y = Math.floor(H * 0.1);
      sprite.zIndex = node.zorder;
      stage.addChild(sprite);
    } else {
      // 占位矩形
      const w = Math.floor(W * 0.22);
      const h = Math.floor(H * 0.78);
      const xRatio = SPRITE_X_RATIO[node.screenPosition] ?? 0.5;
      const x = Math.floor(W * xRatio - w / 2);
      const y = Math.floor(H * 0.1);

      const g = new Graphics();
      g.rect(x, y, w, h)
        .fill({ color: 0x1e293b, alpha: 0.85 })
        .stroke({ color: borderColor, width: 3, alpha: 1 });
      g.zIndex = node.zorder;
      stage.addChild(g);

      const label = new Text({
        text: `${(char?.displayName ?? node.characterId) || '?'}\n${node.emotion || ''}`,
        style: { fill: 0xffffff, fontSize: 18, fontFamily: 'sans-serif', align: 'center' },
      });
      label.anchor.set(0.5);
      label.x = x + w / 2;
      label.y = y + h / 2;
      label.zIndex = node.zorder + 0.1;
      stage.addChild(label);
    }
  }

  /** 对话：底部对话框（半透明黑 + 白字） */
  function drawDialogue(node: DialogueNode, W: number, H: number) {
    const stage = stageRef.current;
    if (!stage) return;
    const boxH = Math.floor(H * 0.28);
    const boxY = H - boxH;
    const g = new Graphics();
    g.rect(0, boxY, W, boxH).fill({ color: 0x000000, alpha: 0.6 });
    g.zIndex = 1000;
    stage.addChild(g);

    const speaker = node.speakerId ? getCharacter(node.speakerId) : null;
    const speakerName = node.speakerId
      ? speaker?.displayName ?? node.speakerId
      : '旁白';

    if (speakerName) {
      const nameText = new Text({
        text: speakerName,
        style: {
          fill: speaker ? hexToNumber(speaker.color, 0xffffff) : 0xffffff,
          fontSize: Math.max(14, node.textStyle.fontSize - 4),
          fontFamily: 'sans-serif',
        },
      });
      nameText.x = 32;
      nameText.y = boxY + 12;
      nameText.zIndex = 1001;
      stage.addChild(nameText);
    }

    const body = new Text({
      text: node.text || '(空对话)',
      style: {
        fill: hexToNumber(node.textStyle.fontColor, 0xffffff),
        fontSize: node.textStyle.fontSize,
        fontFamily: 'sans-serif',
        align: node.textStyle.alignment,
        wordWrap: true,
        wordWrapWidth: W - 64,
      },
    });
    body.x = 32;
    body.y = boxY + 12 + Math.max(14, node.textStyle.fontSize - 4) + 8;
    body.zIndex = 1001;
    stage.addChild(body);
  }

  /** 选项：画布中央绘制选项按钮占位 */
  function drawChoice(node: ChoiceNode, W: number, H: number) {
    const stage = stageRef.current;
    if (!stage) return;
    const count = node.choices.length;
    if (count === 0) return;
    const btnW = Math.floor(W * 0.36);
    const btnH = 48;
    const gap = 12;
    const totalH = count * btnH + (count - 1) * gap;
    const startY = Math.floor((H - totalH) / 2);

    node.choices.forEach((choice, idx) => {
      const x = Math.floor((W - btnW) / 2);
      const y = startY + idx * (btnH + gap);
      const g = new Graphics();
      g.roundRect(x, y, btnW, btnH, 8)
        .fill({ color: 0x1e293b, alpha: 0.9 })
        .stroke({ color: 0x60a5fa, width: 2, alpha: 1 });
      g.zIndex = 2000;
      stage.addChild(g);

      const t = new Text({
        text: choice.text || `选项 ${idx + 1}`,
        style: { fill: 0xffffff, fontSize: 18, fontFamily: 'sans-serif' },
      });
      t.anchor.set(0.5);
      t.x = x + btnW / 2;
      t.y = y + btnH / 2;
      t.zIndex = 2001;
      stage.addChild(t);
    });
  }

  return (
    <div className="relative h-full w-full flex items-center justify-center bg-surface-950 overflow-hidden">
      <div ref={containerRef} className="flex items-center justify-center w-full h-full" />
      {appReady && nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-surface-500 text-sm">暂无内容</span>
        </div>
      )}
    </div>
  );
}
