/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
'use client';

import { type ChangeEventHandler, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  deleteSkipConfig,
  EpisodeSkipConfig,
  getSkipConfig,
  saveSkipConfig,
  SkipSegment,
} from '@/lib/db.client';


// 跳过预设（片头片尾模板）
interface SkipPreset {
  id: string;
  name: string;
  openingEnd: number;   // 片头结束时间（秒），0 表示不跳片头
  endingStart: number;  // 片尾提前时间（秒，剩余模式），0 表示不跳片尾
}

const SKIP_PRESETS_KEY = 'moontv_skip_presets';
const MAX_PRESET_COUNT = 20;

function sanitizePresetList(input: unknown[]): SkipPreset[] {
  return input
    .map((item): SkipPreset | null => {
      if (!item || typeof item !== 'object') return null;
      const p = item as Record<string, unknown>;
      const name = typeof p.name === 'string' ? p.name.trim().slice(0, 30) : '';
      if (!name) return null;
      const openingEnd = Math.max(0, Number(p.openingEnd) || 0);
      const endingStart = Math.max(0, Number(p.endingStart) || 0);
      // 至少要有一个有效值
      if (openingEnd <= 0 && endingStart <= 0) return null;
      return {
        id: typeof p.id === 'string' && p.id ? p.id : Date.now().toString(),
        name,
        openingEnd,
        endingStart,
      };
    })
    .filter((item): item is SkipPreset => item !== null)
    .slice(0, MAX_PRESET_COUNT);
}

function loadSkipPresets(): SkipPreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SKIP_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? sanitizePresetList(parsed) : [];
  } catch {
    return [];
  }
}

function saveSkipPresetsToStorage(presets: SkipPreset[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SKIP_PRESETS_KEY, JSON.stringify(presets.slice(0, MAX_PRESET_COUNT)));
}

interface SkipControllerProps {
  source: string;
  id: string;
  title: string;
  episodeIndex?: number; // 新增：当前集数索引，用于区分不同集数
  artPlayerRef: React.MutableRefObject<any>;
  currentTime?: number;
  duration?: number;
  isSettingMode?: boolean;
  onSettingModeChange?: (isOpen: boolean) => void;
  onNextEpisode?: () => void; // 新增：跳转下一集的回调
}

export default function SkipController({
  source,
  id,
  title,
  episodeIndex = 0,
  artPlayerRef,
  currentTime = 0,
  duration = 0,
  isSettingMode = false,
  onSettingModeChange,
  onNextEpisode,
}: SkipControllerProps) {
  const [skipConfig, setSkipConfig] = useState<EpisodeSkipConfig | null>(null);
  const [showSkipButton, setShowSkipButton] = useState(false);
  const [currentSkipSegment, setCurrentSkipSegment] = useState<SkipSegment | null>(null);
  const [newSegment, setNewSegment] = useState<Partial<SkipSegment>>({});

  // 跳过预设状态
  const [skipPresets, setSkipPresets] = useState<SkipPreset[]>(loadSkipPresets);
  const [newPresetName, setNewPresetName] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState('');

  // 导入/导出相关状态
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [pendingImportedPresets, setPendingImportedPresets] = useState<SkipPreset[]>([]);
  const [presetFeedback, setPresetFeedback] = useState('');
  const importInputRef = useRef<HTMLInputElement | null>(null);

  // 反馈信息自动清除
  useEffect(() => {
    if (!presetFeedback) return;
    const timer = setTimeout(() => setPresetFeedback(''), 3000);
    return () => clearTimeout(timer);
  }, [presetFeedback]);

  // 新增状态：批量设置模式 - 支持分:秒格式
  // 🔑 初始化时直接从 localStorage 读取用户设置，避免重新挂载时重置为默认值
  const [batchSettings, setBatchSettings] = useState(() => {
    const savedEnableAutoSkip = typeof window !== 'undefined' ? localStorage.getItem('enableAutoSkip') : null;
    const savedEnableAutoNextEpisode = typeof window !== 'undefined' ? localStorage.getItem('enableAutoNextEpisode') : null;
    const userAutoSkip = savedEnableAutoSkip !== null ? JSON.parse(savedEnableAutoSkip) : true;
    const userAutoNextEpisode = savedEnableAutoNextEpisode !== null ? JSON.parse(savedEnableAutoNextEpisode) : true;

    return {
      openingStart: '0:00',   // 片头开始时间（分:秒格式）
      openingEnd: '1:30',     // 片头结束时间（分:秒格式，90秒=1分30秒）
      endingMode: 'remaining', // 片尾模式：'remaining'(剩余时间) 或 'absolute'(绝对时间)
      endingStart: '2:00',    // 片尾开始时间（剩余时间模式：还剩多少时间开始倒计时；绝对时间模式：从视频开始多长时间）
      endingEnd: '',          // 片尾结束时间（可选，空表示直接跳转下一集）
      autoSkip: userAutoSkip,         // 🔑 从 localStorage 读取
      autoNextEpisode: userAutoNextEpisode,  // 🔑 从 localStorage 读取
    };
  });

  // 🔑 从 localStorage 读取用户全局设置，并监听变化
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 读取 localStorage 的函数
    const loadUserSettings = () => {
      const savedEnableAutoSkip = localStorage.getItem('enableAutoSkip');
      const savedEnableAutoNextEpisode = localStorage.getItem('enableAutoNextEpisode');
      const userAutoSkip = savedEnableAutoSkip !== null ? JSON.parse(savedEnableAutoSkip) : true;
      const userAutoNextEpisode = savedEnableAutoNextEpisode !== null ? JSON.parse(savedEnableAutoNextEpisode) : true;

      setBatchSettings(prev => ({
        ...prev,
        autoSkip: userAutoSkip,
        autoNextEpisode: userAutoNextEpisode,
      }));
    };

    // 初始化时读取一次
    loadUserSettings();

    // 🔑 监听 storage 事件（其他标签页或窗口的变化）
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'enableAutoSkip' || e.key === 'enableAutoNextEpisode') {
        loadUserSettings();
      }
    };

    // 🔑 监听自定义事件（同一页面内UserMenu的变化）
    const handleLocalSettingsChange = () => {
      loadUserSettings();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('localStorageChanged', handleLocalSettingsChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('localStorageChanged', handleLocalSettingsChange);
    };
  }, []);

  const lastSkipTimeRef = useRef<number>(0);
  const skipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoSkipTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 🔥 关键修复：记录已处理的片段，防止重复触发
  const lastProcessedSegmentRef = useRef<{ type: string; episodeId: string } | null>(null);

  // 🔥 新增：防止集数切换后立即触发的冷却时间
  const episodeSwitchCooldownRef = useRef<number>(0);

  // 🔑 使用 ref 来存储 batchSettings，避免触发不必要的重新渲染
  const batchSettingsRef = useRef(batchSettings);

  // 🔑 同步 batchSettings 到 ref
  useEffect(() => {
    batchSettingsRef.current = batchSettings;
  }, [batchSettings]);

  // 拖动相关状态
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState(() => {
    // 从 localStorage 读取保存的位置
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('skipControllerPosition');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error('解析保存的位置失败:', e);
        }
      }
    }
    // 默认左下角
    return { x: 16, y: window.innerHeight - 200 };
  });
  const dragStartPos = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // 拖动处理函数
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // 只在点击顶部标题栏时触发拖动
    if ((e.target as HTMLElement).closest('.drag-handle')) {
      setIsDragging(true);
      dragStartPos.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
    }
  }, [position]);

  // 触摸开始
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('.drag-handle')) {
      setIsDragging(true);
      const touch = e.touches[0];
      dragStartPos.current = {
        x: touch.clientX - position.x,
        y: touch.clientY - position.y,
      };
    }
  }, [position]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;

    const newX = e.clientX - dragStartPos.current.x;
    const newY = e.clientY - dragStartPos.current.y;

    const maxX = window.innerWidth - (panelRef.current?.offsetWidth || 200);
    const maxY = window.innerHeight - (panelRef.current?.offsetHeight || 200);

    setPosition({
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY)),
    });
  }, [isDragging]);

  // 触摸移动
  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDragging) return;

    const touch = e.touches[0];
    const newX = touch.clientX - dragStartPos.current.x;
    const newY = touch.clientY - dragStartPos.current.y;

    const maxX = window.innerWidth - (panelRef.current?.offsetWidth || 200);
    const maxY = window.innerHeight - (panelRef.current?.offsetHeight || 200);

    setPosition({
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY)),
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem('skipControllerPosition', JSON.stringify(position));
    }
  }, [position]);

  // 添加全局事件监听
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove]);

  // 时间格式转换函数
  const timeToSeconds = useCallback((timeStr: string): number => {
    if (!timeStr || timeStr.trim() === '') return 0;

    // 支持多种格式: "2:10", "2:10.5", "130", "130.5"
    if (timeStr.includes(':')) {
      const parts = timeStr.split(':');
      const minutes = parseInt(parts[0]) || 0;
      const seconds = parseFloat(parts[1]) || 0;
      return minutes * 60 + seconds;
    } else {
      return parseFloat(timeStr) || 0;
    }
  }, []);

  const secondsToTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const decimal = seconds % 1;
    if (decimal > 0) {
      return `${mins}:${secs.toString().padStart(2, '0')}.${Math.floor(decimal * 10)}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // 快速标记当前时间为片头结束
  const markCurrentAsOpeningEnd = useCallback(() => {
    if (!artPlayerRef.current) return;
    const currentTime = artPlayerRef.current.currentTime || 0;
    if (currentTime > 0) {
      setBatchSettings(prev => ({
        ...prev,
        openingEnd: secondsToTime(currentTime)
      }));
      // 显示提示
      if (artPlayerRef.current.notice) {
        artPlayerRef.current.notice.show = `已标记片头结束: ${secondsToTime(currentTime)}`;
      }
    }
  }, [artPlayerRef, secondsToTime]);

  // 快速标记当前时间为片尾开始
  const markCurrentAsEndingStart = useCallback(() => {
    if (!artPlayerRef.current || !duration) return;
    const currentTime = artPlayerRef.current.currentTime || 0;

    if (batchSettings.endingMode === 'remaining') {
      // 剩余时间模式
      const remainingTime = duration - currentTime;
      if (remainingTime > 0) {
        setBatchSettings(prev => ({
          ...prev,
          endingStart: secondsToTime(remainingTime),
        }));
        // 显示提示
        if (artPlayerRef.current.notice) {
          artPlayerRef.current.notice.show = `已标记片尾开始: 剩余${secondsToTime(remainingTime)}`;
        }
      }
    } else {
      // 绝对时间模式
      if (currentTime > 0) {
        setBatchSettings(prev => ({
          ...prev,
          endingStart: secondsToTime(currentTime),
        }));
        // 显示提示
        if (artPlayerRef.current.notice) {
          artPlayerRef.current.notice.show = `已标记片尾开始: ${secondsToTime(currentTime)}`;
        }
      }
    }
  }, [artPlayerRef, duration, secondsToTime, batchSettings.endingMode]);

  // 加载跳过配置
  const loadSkipConfig = useCallback(async () => {
    try {
      const config = await getSkipConfig(source, id);
      setSkipConfig(config);
    } catch (err) {
      console.error('❌ 加载跳过配置失败:', err);
    }
  }, [source, id]);

  // 自动跳过逻辑
  const handleAutoSkip = useCallback((segment: SkipSegment) => {
    if (!artPlayerRef.current) return;

    // 如果是片尾且开启了自动下一集，直接跳转下一集
    if (segment.type === 'ending' && segment.autoNextEpisode && onNextEpisode) {
      // 🔑 先暂停视频，防止 video:ended 事件再次触发
      if (artPlayerRef.current) {
        if (!artPlayerRef.current.paused) {
          artPlayerRef.current.pause();
        }
        // 显示跳过提示
        if (artPlayerRef.current.notice) {
          artPlayerRef.current.notice.show = '自动跳转下一集';
        }
      }
      // 🔥 设置冷却时间，防止新集数立即触发
      episodeSwitchCooldownRef.current = Date.now();
      console.log(`🚫 [SkipController] 设置集数切换冷却时间: ${episodeSwitchCooldownRef.current}`);

      // 🔥 关键修复：立即调用 onNextEpisode，不使用延迟
      onNextEpisode();
    } else {
      // 否则跳到片段结束位置
      const targetTime = segment.end + 1;
      artPlayerRef.current.currentTime = targetTime;
      lastSkipTimeRef.current = Date.now();

      // 显示跳过提示
      if (artPlayerRef.current.notice) {
        const segmentName = segment.type === 'opening' ? '片头' : '片尾';
        artPlayerRef.current.notice.show = `自动跳过${segmentName}`;
      }
    }

    setCurrentSkipSegment(null);
  }, [artPlayerRef, onNextEpisode]);

  // 检查当前播放时间是否在跳过区间内
  const checkSkipSegment = useCallback(
    (time: number) => {
      // 🔥 检查冷却时间：如果刚切换集数不到3秒，不处理任何跳过逻辑
      const cooldownTime = 3000; // 3秒冷却时间
      const timeSinceSwitch = Date.now() - episodeSwitchCooldownRef.current;
      if (episodeSwitchCooldownRef.current > 0 && timeSinceSwitch < cooldownTime) {
        // console.log(`⏳ [SkipController] 冷却中，已过${timeSinceSwitch}ms，还需${cooldownTime - timeSinceSwitch}ms`);
        return;
      }

      // 🔑 使用 ref 中的 batchSettings，避免闭包问题
      const currentBatchSettings = batchSettingsRef.current;

      console.log(`🔍 [SkipController] 检查时间点 ${time.toFixed(2)}s, autoSkip=${currentBatchSettings.autoSkip}, autoNextEpisode=${currentBatchSettings.autoNextEpisode}`);

      // 如果没有保存的配置，使用 batchSettings 默认配置
      let segments = skipConfig?.segments;

      if (!segments || segments.length === 0) {
        // 根据 batchSettings 生成临时配置
        const tempSegments: SkipSegment[] = [];

        // 添加片头配置
        const openingStart = timeToSeconds(currentBatchSettings.openingStart);
        const openingEnd = timeToSeconds(currentBatchSettings.openingEnd);

        // 🔥 优化：对于短视频，智能调整片头检测范围
        // 如果视频总长度小于 5 分钟（300秒），不启用默认片头检测
        // 避免在短视频中频繁触发片头跳过
        const isShortVideo = duration > 0 && duration < 300; // 5分钟以下算短视频
        const shouldEnableOpening = openingStart < openingEnd && (!isShortVideo || openingEnd < duration * 0.3);

        if (shouldEnableOpening) {
          tempSegments.push({
            type: 'opening',
            start: openingStart,
            end: Math.min(openingEnd, duration * 0.4), // 限制片头最多占视频40%
            autoSkip: currentBatchSettings.autoSkip,
          });
          console.log(`✅ [SkipController] 添加片头配置: ${openingStart}s-${Math.min(openingEnd, duration * 0.4)}s, autoSkip=${currentBatchSettings.autoSkip}`);
        } else if (isShortVideo) {
          console.log(`⏭️ [SkipController] 短视频(${duration}s)，跳过片头检测`);
        }


        // 添加片尾配置（如果设置了）
        if (duration > 0 && currentBatchSettings.endingStart) {
          const endingStartSeconds = timeToSeconds(currentBatchSettings.endingStart);
          const endingStart = currentBatchSettings.endingMode === 'remaining'
            ? duration - endingStartSeconds
            : endingStartSeconds;

          // 🔥 优化：对于短视频，确保片尾检测合理
          // 如果片尾开始时间太早（超过视频60%），调整或跳过
          const endingStartRatio = endingStart / duration;
          const shouldEnableEnding = endingStart < duration && endingStartRatio > 0.6;

          if (shouldEnableEnding) {
            tempSegments.push({
              type: 'ending',
              start: endingStart,
              end: duration,
              autoSkip: currentBatchSettings.autoSkip,
              autoNextEpisode: currentBatchSettings.autoNextEpisode,
              mode: currentBatchSettings.endingMode as 'absolute' | 'remaining',
              remainingTime: currentBatchSettings.endingMode === 'remaining' ? endingStartSeconds : undefined,
            });
            console.log(`✅ [SkipController] 添加片尾配置: ${endingStart}s-${duration}s, autoSkip=${currentBatchSettings.autoSkip}, autoNextEpisode=${currentBatchSettings.autoNextEpisode}`);
          } else {
            console.log(`⏭️ [SkipController] 片尾开始时间(${endingStart}s)太早(${(endingStartRatio * 100).toFixed(1)}%)，跳过片尾检测`);
          }
        }

        segments = tempSegments;
        console.log(`📋 [SkipController] 使用临时配置，共${tempSegments.length}个片段`);
      } else {
        // 如果有保存的配置，处理 remaining 模式
        segments = segments.map(seg => {
          if (seg.type === 'ending' && seg.mode === 'remaining' && seg.remainingTime) {
            // 重新计算 start 和 end（基于当前视频的 duration）
            return {
              ...seg,
              start: duration - seg.remainingTime,
              end: duration,
            };
          }
          return seg;
        });
      }

      if (!segments || segments.length === 0) {
        return;
      }

      const currentSegment = segments.find(
        (segment) => time >= segment.start && time <= segment.end
      );

      console.log(`🔎 [SkipController] 查找片段结果: currentSegment=${currentSegment ? `${currentSegment.type}(${currentSegment.start}s-${currentSegment.end}s)` : 'null'}, currentSkipSegment=${currentSkipSegment?.type || 'null'}`);

      // 🔥 关键修复：使用 source + id + episodeIndex 作为集数标识，确保不同集数有不同的ID
      const currentEpisodeId = `${source}_${id}_${episodeIndex}`;
      const lastProcessed = lastProcessedSegmentRef.current;

      // 比较片段类型而不是对象引用（避免临时对象导致的重复触发）
      if (currentSegment && currentSegment.type !== currentSkipSegment?.type) {
        console.log(`🎯 [SkipController] 检测到${currentSegment.type}片段: ${currentSegment.start}s-${currentSegment.end}s, autoSkip=${currentSegment.autoSkip}`);
        console.log(`📌 [SkipController] 防重复检查: lastProcessed=${lastProcessed ? `${lastProcessed.type}@${lastProcessed.episodeId}` : 'null'}, currentEpisodeId=${currentEpisodeId}`);

        // 🔥 关键修复：检查是否已经处理过这个片段（同一集同一片段类型）
        if (lastProcessed && lastProcessed.type === currentSegment.type && lastProcessed.episodeId === currentEpisodeId) {
          console.log(`⚠️ [防重复] 已处理过 ${currentSegment.type} 片段，跳过重复触发`);
          return;
        }

        setCurrentSkipSegment(currentSegment);

        // 检查当前片段是否开启自动跳过（默认为true）
        const shouldAutoSkip = currentSegment.autoSkip !== false;
        console.log(`🔧 [SkipController] shouldAutoSkip=${shouldAutoSkip}, currentSegment.autoSkip=${currentSegment.autoSkip}`);

        if (shouldAutoSkip) {
          // 🔥 标记已处理
          lastProcessedSegmentRef.current = { type: currentSegment.type, episodeId: currentEpisodeId };
          console.log(`🚀 [SkipController] 执行自动跳过: ${currentSegment.type}`);

          // 🔥 关键修复：立即执行跳过，不延迟！
          handleAutoSkip(currentSegment);
          setShowSkipButton(false); // 自动跳过时不显示按钮
        } else {
          console.log(`👆 [SkipController] 显示手动跳过按钮`);
          // 手动模式：显示跳过按钮
          setShowSkipButton(true);

          // 自动隐藏跳过按钮
          if (skipTimeoutRef.current) {
            clearTimeout(skipTimeoutRef.current);
          }
          skipTimeoutRef.current = setTimeout(() => {
            setShowSkipButton(false);
            setCurrentSkipSegment(null);
          }, 8000);
        }
      } else if (!currentSegment && currentSkipSegment?.type) {
        setCurrentSkipSegment(null);
        setShowSkipButton(false);
        if (skipTimeoutRef.current) {
          clearTimeout(skipTimeoutRef.current);
        }
        if (autoSkipTimeoutRef.current) {
          clearTimeout(autoSkipTimeoutRef.current);
        }
      }
    },
    [skipConfig, currentSkipSegment, handleAutoSkip, duration, timeToSeconds, source, id, episodeIndex] // 🔥 添加 episodeIndex 依赖，用于防重复检查
  );

  // 执行跳过
  const handleSkip = useCallback(() => {
    if (!currentSkipSegment || !artPlayerRef.current) return;

    // 如果是片尾且有下一集回调，则播放下一集
    if (currentSkipSegment.type === 'ending' && onNextEpisode) {
      setShowSkipButton(false);
      setCurrentSkipSegment(null);

      if (skipTimeoutRef.current) {
        clearTimeout(skipTimeoutRef.current);
      }

      // 🔑 先暂停视频并显示提示，防止 video:ended 事件再次触发
      if (artPlayerRef.current) {
        if (!artPlayerRef.current.paused) {
          artPlayerRef.current.pause();
        }
        // 显示提示
        if (artPlayerRef.current.notice) {
          artPlayerRef.current.notice.show = '正在播放下一集...';
        }
      }

      // 🔥 关键修复：立即调用 onNextEpisode，不使用延迟
      // onNextEpisode 内部会设置 isSkipControllerTriggeredRef 标志，必须在 video:ended 事件之前设置
      onNextEpisode();
      return;
    }

    // 片头或没有下一集回调时，执行普通跳过
    const targetTime = currentSkipSegment.end + 1; // 跳到片段结束后1秒
    artPlayerRef.current.currentTime = targetTime;
    lastSkipTimeRef.current = Date.now();

    setShowSkipButton(false);
    setCurrentSkipSegment(null);

    if (skipTimeoutRef.current) {
      clearTimeout(skipTimeoutRef.current);
    }

    // 显示跳过提示
    if (artPlayerRef.current.notice) {
      const segmentName = currentSkipSegment.type === 'opening' ? '片头' : '片尾';
      artPlayerRef.current.notice.show = `已跳过${segmentName}`;
    }
  }, [currentSkipSegment, artPlayerRef, onNextEpisode]);

  // 保存新的跳过片段（单个片段模式）
  const handleSaveSegment = useCallback(async () => {
    if (!newSegment.start || !newSegment.end || !newSegment.type) {
      alert('请填写完整的跳过片段信息');
      return;
    }

    if (newSegment.start >= newSegment.end) {
      alert('开始时间必须小于结束时间');
      return;
    }

    try {
      const segment: SkipSegment = {
        start: newSegment.start,
        end: newSegment.end,
        type: newSegment.type as 'opening' | 'ending',
        title: newSegment.title || (newSegment.type === 'opening' ? '片头' : '片尾'),
        autoSkip: true, // 默认开启自动跳过
        autoNextEpisode: newSegment.type === 'ending', // 片尾默认开启自动下一集
      };

      const updatedConfig: EpisodeSkipConfig = {
        source,
        id,
        title,
        segments: skipConfig?.segments ? [...skipConfig.segments, segment] : [segment],
        updated_time: Date.now(),
      };

      await saveSkipConfig(source, id, updatedConfig);
      setSkipConfig(updatedConfig);
      onSettingModeChange?.(false);
      setNewSegment({});

      alert('跳过片段已保存');
    } catch (err) {
      console.error('保存跳过片段失败:', err);
      alert('保存失败，请重试');
    }
  }, [newSegment, skipConfig, source, id, title, onSettingModeChange]);

  // 保存批量设置的跳过配置
  const handleSaveBatchSettings = useCallback(async () => {
    const segments: SkipSegment[] = [];

    // 添加片头设置
    if (batchSettings.openingStart && batchSettings.openingEnd) {
      const start = timeToSeconds(batchSettings.openingStart);
      const end = timeToSeconds(batchSettings.openingEnd);

      if (start >= end) {
        alert('片头开始时间必须小于结束时间');
        return;
      }

      segments.push({
        start,
        end,
        type: 'opening',
        title: '片头',
        autoSkip: batchSettings.autoSkip,
      });
    }

    // 添加片尾设置
    if (batchSettings.endingStart) {
      const endingStartSeconds = timeToSeconds(batchSettings.endingStart);

      if (batchSettings.endingMode === 'remaining') {
        // 剩余时间模式：保存剩余时间信息
        let actualStartSeconds = duration - endingStartSeconds;

        if (actualStartSeconds < 0) {
          actualStartSeconds = 0;
        }

        segments.push({
          start: actualStartSeconds,
          end: batchSettings.endingEnd ? duration - timeToSeconds(batchSettings.endingEnd) : duration,
          type: 'ending',
          title: `剩余${batchSettings.endingStart}时跳转下一集`,
          autoSkip: batchSettings.autoSkip,
          autoNextEpisode: batchSettings.autoNextEpisode,
          mode: 'remaining',
          remainingTime: endingStartSeconds, // 保存剩余时间
        });
      } else {
        // 绝对时间模式
        const actualStartSeconds = endingStartSeconds;
        const actualEndSeconds = batchSettings.endingEnd ? timeToSeconds(batchSettings.endingEnd) : duration;

        if (actualStartSeconds >= actualEndSeconds) {
          alert('片尾开始时间必须小于结束时间');
          return;
        }

        segments.push({
          start: actualStartSeconds,
          end: actualEndSeconds,
          type: 'ending',
          title: '片尾',
          autoSkip: batchSettings.autoSkip,
          autoNextEpisode: batchSettings.autoNextEpisode,
          mode: 'absolute',
        });
      }
    }

    if (segments.length === 0) {
      alert('请至少设置片头或片尾时间');
      return;
    }

    try {
      const updatedConfig: EpisodeSkipConfig = {
        source,
        id,
        title,
        segments,
        updated_time: Date.now(),
      };

      await saveSkipConfig(source, id, updatedConfig);
      setSkipConfig(updatedConfig);
      // batchSettings 会通过 useEffect 自动从 skipConfig 同步，不需要手动重置
      onSettingModeChange?.(false);

      alert('跳过配置已保存');
    } catch (err) {
      console.error('保存跳过配置失败:', err);
      alert('保存失败，请重试');
    }
  }, [batchSettings, duration, source, id, title, onSettingModeChange, timeToSeconds, secondsToTime]);

  // 删除跳过片段
  const handleDeleteSegment = useCallback(
    async (index: number) => {
      if (!skipConfig?.segments) return;

      try {
        const updatedSegments = skipConfig.segments.filter((_, i) => i !== index);

        if (updatedSegments.length === 0) {
          // 如果没有片段了，删除整个配置
          await deleteSkipConfig(source, id);
          setSkipConfig(null);
        } else {
          // 更新配置
          const updatedConfig: EpisodeSkipConfig = {
            ...skipConfig,
            segments: updatedSegments,
            updated_time: Date.now(),
          };
          await saveSkipConfig(source, id, updatedConfig);
          setSkipConfig(updatedConfig);
        }

        alert('跳过片段已删除');
      } catch (err) {
        console.error('删除跳过片段失败:', err);
        alert('删除失败，请重试');
      }
    },
    [skipConfig, source, id]
  );

  // 格式化时间显示
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 计算实际的 segments（处理 remaining 模式）
  const actualSegments = useMemo(() => {
    if (!skipConfig?.segments) return [];

    return skipConfig.segments.map(seg => {
      if (seg.type === 'ending' && seg.mode === 'remaining' && seg.remainingTime && duration > 0) {
        // 基于当前 duration 重新计算片尾时间
        return {
          ...seg,
          start: duration - seg.remainingTime,
          end: duration,
        };
      }
      return seg;
    });
  }, [skipConfig, duration]);

  // 初始化加载配置
  useEffect(() => {
    loadSkipConfig();
  }, [loadSkipConfig]);

  // 🔑 确保每次 source/id 变化时，都从 localStorage 读取用户全局设置
  useEffect(() => {
    const savedEnableAutoSkip = localStorage.getItem('enableAutoSkip');
    const savedEnableAutoNextEpisode = localStorage.getItem('enableAutoNextEpisode');
    const userAutoSkip = savedEnableAutoSkip !== null ? JSON.parse(savedEnableAutoSkip) : true;
    const userAutoNextEpisode = savedEnableAutoNextEpisode !== null ? JSON.parse(savedEnableAutoNextEpisode) : true;

    console.log(`📖 [SkipController] 读取用户设置: autoSkip=${userAutoSkip}, autoNextEpisode=${userAutoNextEpisode}`);

    setBatchSettings(prev => ({
      ...prev,
      autoSkip: userAutoSkip,
      autoNextEpisode: userAutoNextEpisode,
    }));
  }, [source, id]); // 切换集数时重新读取用户设置

  // 当 skipConfig 改变时，同步到 batchSettings（但保留用户全局设置）
  // 🔑 注意：这个 useEffect 只在 skipConfig 改变时触发，不受 duration 影响
  useEffect(() => {
    if (skipConfig && skipConfig.segments && skipConfig.segments.length > 0) {
      // 找到片头和片尾片段
      const openingSegment = skipConfig.segments.find(s => s.type === 'opening');
      const endingSegment = skipConfig.segments.find(s => s.type === 'ending');

      // 🔑 只更新时间相关的字段，不更新 autoSkip 和 autoNextEpisode
      setBatchSettings(prev => {
        return {
          ...prev,
          openingStart: openingSegment ? secondsToTime(openingSegment.start) : prev.openingStart,
          openingEnd: openingSegment ? secondsToTime(openingSegment.end) : prev.openingEnd,
          endingStart: endingSegment
            ? (endingSegment.mode === 'remaining' && endingSegment.remainingTime
                ? secondsToTime(endingSegment.remainingTime)
                : (duration > 0 ? secondsToTime(duration - endingSegment.start) : prev.endingStart))
            : prev.endingStart,
          endingEnd: endingSegment
            ? (endingSegment.mode === 'remaining' && endingSegment.end < duration && duration > 0
                ? secondsToTime(duration - endingSegment.end)
                : '')
            : prev.endingEnd,
          endingMode: endingSegment?.mode === 'absolute' ? 'absolute' : 'remaining',
          // 🔑 保持当前的 autoSkip 和 autoNextEpisode 不变（已经通过其他 useEffect 从 localStorage 读取）
        };
      });
    }
  }, [skipConfig, duration]); // 🔑 移除 secondsToTime 依赖，避免不必要的触发

  // 监听播放时间变化
  useEffect(() => {
    if (currentTime > 0) {
      checkSkipSegment(currentTime);
    }
  }, [currentTime, checkSkipSegment]);

  // 当 source 或 id 或 episodeIndex 变化时，清理所有状态（换集时）
  useEffect(() => {
    console.log(`🔄 [SkipController] 集数变化: source=${source}, id=${id}, episodeIndex=${episodeIndex}, 清理状态`);
    console.log(`🧹 [SkipController] 清理前 lastProcessedSegmentRef:`, lastProcessedSegmentRef.current);
    setShowSkipButton(false);
    setCurrentSkipSegment(null);
    // 🔥 清除已处理标记，允许新集数重新处理
    lastProcessedSegmentRef.current = null;
    // 🔥 设置冷却时间，防止新集数立即触发自动跳过
    episodeSwitchCooldownRef.current = Date.now();
    console.log(`✅ [SkipController] 已清除 lastProcessedSegmentRef，设置冷却时间，允许新集数处理`);

    if (skipTimeoutRef.current) {
      clearTimeout(skipTimeoutRef.current);
    }
    if (autoSkipTimeoutRef.current) {
      clearTimeout(autoSkipTimeoutRef.current);
    }
  }, [source, id, episodeIndex]);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (skipTimeoutRef.current) {
        clearTimeout(skipTimeoutRef.current);
      }
      if (autoSkipTimeoutRef.current) {
        clearTimeout(autoSkipTimeoutRef.current);
      }
    };
  }, []);

  // 🔑 关闭弹窗的统一处理函数
  const handleCloseDialog = useCallback(() => {
    onSettingModeChange?.(false);
    // 取消时从 localStorage 读取用户设置，不能硬编码默认值
    const savedEnableAutoSkip = localStorage.getItem('enableAutoSkip');
    const savedEnableAutoNextEpisode = localStorage.getItem('enableAutoNextEpisode');
    const userAutoSkip = savedEnableAutoSkip !== null ? JSON.parse(savedEnableAutoSkip) : true;
    const userAutoNextEpisode = savedEnableAutoNextEpisode !== null ? JSON.parse(savedEnableAutoNextEpisode) : true;

    setBatchSettings({
      openingStart: '0:00',
      openingEnd: '1:30',
      endingMode: 'remaining',
      endingStart: '2:00',
      endingEnd: '',
      autoSkip: userAutoSkip,
      autoNextEpisode: userAutoNextEpisode,
    });
  }, [onSettingModeChange]);

  // 🔑 监听 ESC 键关闭弹窗
  useEffect(() => {
    if (!isSettingMode) return;

    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCloseDialog();
      }
    };

    window.addEventListener('keydown', handleEscKey);
    return () => {
      window.removeEventListener('keydown', handleEscKey);
    };
  }, [isSettingMode, handleCloseDialog]);

  // 跳过预设 - 从当前配置新建预设
  const handleCreatePreset = useCallback(() => {
    const name = newPresetName.trim().slice(0, 30);
    if (!name) {
      setPresetFeedback('请输入预设名称');
      return;
    }
    if (skipPresets.length >= MAX_PRESET_COUNT) {
      setPresetFeedback(`最多只能添加 ${MAX_PRESET_COUNT} 个预设`);
      return;
    }
    if (skipPresets.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      setPresetFeedback('预设名称已存在');
      return;
    }
    const openingEnd = timeToSeconds(batchSettings.openingEnd);
    const endingStart = batchSettings.endingMode === 'remaining'
      ? timeToSeconds(batchSettings.endingStart)
      : 0; // 绝对模式暂不存入预设
    if (openingEnd <= 0 && endingStart <= 0) {
      setPresetFeedback('当前片头片尾都为 0，无法创建预设');
      return;
    }
    const preset: SkipPreset = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      openingEnd,
      endingStart,
    };
    const updated = [...skipPresets, preset];
    setSkipPresets(updated);
    saveSkipPresetsToStorage(updated);
    setNewPresetName('');
    setSelectedPresetId(preset.id);
    setPresetFeedback(`已创建预设「${name}」`);
  }, [newPresetName, skipPresets, batchSettings, timeToSeconds]);

  // 跳过预设 - 套用到当前 batchSettings
  const handleApplyPreset = useCallback(() => {
    const preset = skipPresets.find(p => p.id === selectedPresetId);
    if (!preset) {
      setPresetFeedback('请先选择一个预设');
      return;
    }
    setBatchSettings(prev => ({
      ...prev,
      openingStart: '0:00',
      openingEnd: secondsToTime(preset.openingEnd),
      endingMode: 'remaining',
      endingStart: preset.endingStart > 0 ? secondsToTime(preset.endingStart) : prev.endingStart,
      endingEnd: '',
    }));
    setPresetFeedback(`已套用预设「${preset.name}」`);
  }, [skipPresets, selectedPresetId, secondsToTime]);

  // 跳过预设 - 删除选中预设
  const handleDeletePreset = useCallback(() => {
    if (!selectedPresetId) {
      setPresetFeedback('请先选择一个预设');
      return;
    }
    const preset = skipPresets.find(p => p.id === selectedPresetId);
    const updated = skipPresets.filter(p => p.id !== selectedPresetId);
    setSkipPresets(updated);
    saveSkipPresetsToStorage(updated);
    setSelectedPresetId(updated[0]?.id || '');
    if (preset) setPresetFeedback(`已删除预设「${preset.name}」`);
  }, [skipPresets, selectedPresetId]);

  // 跳过预设 - 用当前配置覆盖选中预设
  const handleUpdatePreset = useCallback(() => {
    const preset = skipPresets.find(p => p.id === selectedPresetId);
    if (!preset) {
      setPresetFeedback('请先选择一个预设');
      return;
    }
    const openingEnd = timeToSeconds(batchSettings.openingEnd);
    const endingStart = batchSettings.endingMode === 'remaining'
      ? timeToSeconds(batchSettings.endingStart)
      : 0;
    const updated = skipPresets.map(p =>
      p.id === selectedPresetId ? { ...p, openingEnd, endingStart } : p
    );
    setSkipPresets(updated);
    saveSkipPresetsToStorage(updated);
    setPresetFeedback(`已更新预设「${preset.name}」`);
  }, [skipPresets, selectedPresetId, batchSettings, timeToSeconds]);

  // 跳过预设 - 导出
  const handleExportPresets = useCallback(() => {
    if (skipPresets.length === 0) {
      setPresetFeedback('没有预设可导出');
      return;
    }
    const payload = JSON.stringify(skipPresets, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `lunatv-skip-presets-${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setPresetFeedback('预设已导出');
  }, [skipPresets]);

  // 跳过预设 - 导入（选择文件后触发）
  const handleImportPresets: ChangeEventHandler<HTMLInputElement> = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    file.text().then(text => {
      try {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) {
          setPresetFeedback('导入失败：文件格式无效');
          return;
        }
        const imported = sanitizePresetList(parsed);
        if (imported.length === 0) {
          setPresetFeedback('导入失败：未识别到有效预设');
          return;
        }
        setPendingImportedPresets(imported);
        setIsImportDialogOpen(true);
      } catch {
        setPresetFeedback('导入失败：文件内容无法解析');
      }
    });
    event.target.value = '';
  }, []);

  // 跳过预设 - 确认导入
  const handleConfirmImport = useCallback((mode: 'merge' | 'overwrite') => {
    const byName = (name: string) => name.trim().toLowerCase();

    const finalPresets = mode === 'overwrite'
      ? sanitizePresetList(pendingImportedPresets)
      : sanitizePresetList([
          ...pendingImportedPresets,
          ...skipPresets.filter(local =>
            !pendingImportedPresets.some(
              imp => imp.id === local.id || byName(imp.name) === byName(local.name),
            ),
          ),
        ]);

    setSkipPresets(finalPresets);
    saveSkipPresetsToStorage(finalPresets);
    setSelectedPresetId(finalPresets[0]?.id || '');
    setPresetFeedback(`已导入 ${pendingImportedPresets.length} 条预设`);
    setPendingImportedPresets([]);
    setIsImportDialogOpen(false);
  }, [pendingImportedPresets, skipPresets]);

  return (
    <div className="skip-controller">
      {/* 跳过按钮 - 放在播放器内左上角 */}
      {showSkipButton && currentSkipSegment && (
        <div className="absolute top-4 left-4 z-30 bg-black/80 text-white px-4 py-2 rounded-lg backdrop-blur-sm border border-white/20 shadow-lg animate-fade-in">
          <div className="flex items-center space-x-3">
            <span className="text-sm">
              {currentSkipSegment.type === 'opening' ? '检测到片头' : '检测到片尾'}
            </span>
            <button
              onClick={handleSkip}
              className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm font-medium transition-colors"
            >
              {currentSkipSegment.type === 'ending' && onNextEpisode ? '下一集 ▶' : '跳过'}
            </button>
          </div>
        </div>
      )}

      {/* 设置模式面板 - 增强版批量设置 */}
      {isSettingMode && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-9999 p-4 animate-fade-in"
          onClick={handleCloseDialog}
        >
          <div
            className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-[0_20px_60px_0_rgba(0,0,0,0.4)] border border-white/20 dark:border-gray-700/50 animate-scale-in"
            style={{
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题栏带关闭按钮 */}
            <div className="flex items-center justify-between mb-6 border-b border-gray-200/50 dark:border-gray-700/50 pb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <span className="text-2xl">⚙️</span>
                智能跳过设置
              </h3>
              <button
                onClick={handleCloseDialog}
                className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                title="关闭 (ESC)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 全局开关 */}
            <div className="bg-linear-to-br from-blue-50/80 to-indigo-50/80 dark:from-blue-900/30 dark:to-indigo-900/30 p-5 rounded-xl mb-6 border border-blue-100/50 dark:border-blue-800/50 shadow-sm backdrop-blur-sm">
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={batchSettings.autoSkip}
                    onChange={(e) => {
                      const newValue = e.target.checked;
                      setBatchSettings({...batchSettings, autoSkip: newValue});
                      // 🔑 保存到 localStorage，确保跨集保持
                      localStorage.setItem('enableAutoSkip', JSON.stringify(newValue));
                      // 🔑 通知其他组件 localStorage 已更新
                      window.dispatchEvent(new Event('localStorageChanged'));
                    }}
                    className="rounded"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    启用自动跳过
                  </span>
                </label>
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={batchSettings.autoNextEpisode}
                    onChange={(e) => {
                      const newValue = e.target.checked;
                      setBatchSettings({...batchSettings, autoNextEpisode: newValue});
                      // 🔑 保存到 localStorage，确保跨集保持
                      localStorage.setItem('enableAutoNextEpisode', JSON.stringify(newValue));
                      // 🔑 通知其他组件 localStorage 已更新
                      window.dispatchEvent(new Event('localStorageChanged'));
                    }}
                    className="rounded"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    片尾自动播放下一集
                  </span>
                </label>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                开启后将自动跳过设定的片头片尾，无需手动点击
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 片头设置 */}
              <div className="space-y-4 bg-linear-to-br from-green-50/50 to-emerald-50/50 dark:from-green-900/20 dark:to-emerald-900/20 p-4 rounded-xl border border-green-100/50 dark:border-green-800/50 backdrop-blur-sm">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 border-b border-green-200/50 dark:border-green-700/50 pb-2 flex items-center gap-2">
                  <span className="text-xl">🎬</span>
                  片头设置
                </h4>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    开始时间 (分:秒)
                  </label>
                  <input
                    type="text"
                    value={batchSettings.openingStart}
                    onChange={(e) => setBatchSettings({...batchSettings, openingStart: e.target.value})}
                    className="w-full px-4 py-2.5 border border-gray-300/50 dark:border-gray-600/50 rounded-lg bg-white/80 dark:bg-gray-700/80 text-gray-900 dark:text-gray-100 backdrop-blur-sm focus:ring-2 focus:ring-green-500/50 focus:border-green-500 transition-all"
                    placeholder="0:00"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">格式: 分:秒 (如 0:00)</p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    结束时间 (分:秒)
                  </label>
                  <input
                    type="text"
                    value={batchSettings.openingEnd}
                    onChange={(e) => setBatchSettings({...batchSettings, openingEnd: e.target.value})}
                    className="w-full px-4 py-2.5 border border-gray-300/50 dark:border-gray-600/50 rounded-lg bg-white/80 dark:bg-gray-700/80 text-gray-900 dark:text-gray-100 backdrop-blur-sm focus:ring-2 focus:ring-green-500/50 focus:border-green-500 transition-all mb-2"
                    placeholder="1:30"
                  />
                  <button
                    onClick={markCurrentAsOpeningEnd}
                    className="w-full px-4 py-2 bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg text-sm font-medium transition-all shadow-md hover:shadow-lg hover:scale-105 backdrop-blur-sm"
                    title="标记当前播放时间为片头结束时间"
                  >
                      📍 标记当前时间
                  </button>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">格式: 分:秒 (如 1:30)</p>
                </div>
              </div>

              {/* 片尾设置 */}
              <div className="space-y-4 bg-linear-to-br from-purple-50/50 to-pink-50/50 dark:from-purple-900/20 dark:to-pink-900/20 p-4 rounded-xl border border-purple-100/50 dark:border-purple-800/50 backdrop-blur-sm">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 border-b border-purple-200/50 dark:border-purple-700/50 pb-2 flex items-center gap-2">
                  <span className="text-xl">🎭</span>
                  片尾设置
                </h4>

                {/* 片尾模式选择 */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    计时模式
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="endingMode"
                        value="remaining"
                        checked={batchSettings.endingMode === 'remaining'}
                        onChange={(e) => setBatchSettings({...batchSettings, endingMode: e.target.value})}
                        className="mr-2"
                      />
                      剩余时间（推荐）
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="endingMode"
                        value="absolute"
                        checked={batchSettings.endingMode === 'absolute'}
                        onChange={(e) => setBatchSettings({...batchSettings, endingMode: e.target.value})}
                        className="mr-2"
                      />
                      绝对时间
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {batchSettings.endingMode === 'remaining'
                      ? '基于剩余时间倒计时（如：还剩2分钟时开始）'
                      : '基于播放时间（如：播放到第20分钟时开始）'
                    }
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    {batchSettings.endingMode === 'remaining' ? '剩余时间 (分:秒)' : '开始时间 (分:秒)'}
                  </label>
                  <input
                    type="text"
                    value={batchSettings.endingStart}
                    onChange={(e) => setBatchSettings({...batchSettings, endingStart: e.target.value})}
                    className="w-full px-4 py-2.5 border border-gray-300/50 dark:border-gray-600/50 rounded-lg bg-white/80 dark:bg-gray-700/80 text-gray-900 dark:text-gray-100 backdrop-blur-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all mb-2"
                    placeholder={batchSettings.endingMode === 'remaining' ? '2:00' : '20:00'}
                  />
                  <button
                    onClick={markCurrentAsEndingStart}
                    className="w-full px-4 py-2 bg-linear-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-lg text-sm font-medium transition-all shadow-md hover:shadow-lg hover:scale-105 backdrop-blur-sm"
                    title="标记当前播放时间为片尾开始时间"
                  >
                    📍 标记当前时间
                  </button>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                    {batchSettings.endingMode === 'remaining'
                      ? '当剩余时间达到此值时开始倒计时'
                      : '从视频开始播放此时间后开始检测片尾'
                    }
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    结束时间 (分:秒) - 可选
                  </label>
                  <input
                    type="text"
                    value={batchSettings.endingEnd}
                    onChange={(e) => setBatchSettings({...batchSettings, endingEnd: e.target.value})}
                    className="w-full px-4 py-2.5 border border-gray-300/50 dark:border-gray-600/50 rounded-lg bg-white/80 dark:bg-gray-700/80 text-gray-900 dark:text-gray-100 backdrop-blur-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"
                    placeholder="留空直接跳下一集"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">空白=直接跳下一集</p>
                </div>
              </div>
            </div>

            <div className="mt-6 p-5 bg-linear-to-br from-gray-50/80 to-slate-50/80 dark:from-gray-700/80 dark:to-slate-700/80 rounded-xl border border-gray-200/50 dark:border-gray-600/50 backdrop-blur-sm shadow-inner">
              <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                <p><strong>当前播放时间:</strong> {secondsToTime(currentTime)}</p>
                {duration > 0 && (
                  <>
                    <p><strong>视频总长度:</strong> {secondsToTime(duration)}</p>
                    <p><strong>剩余时间:</strong> {secondsToTime(duration - currentTime)}</p>
                  </>
                )}
                <div className="text-xs mt-3 text-gray-500 dark:text-gray-400 space-y-1 border-t border-gray-300 dark:border-gray-600 pt-2">
                  <p className="font-semibold text-gray-700 dark:text-gray-300">📝 使用说明：</p>
                  <p>🎬 <strong>片头设置:</strong> 播放到片头结束位置，点击"📍 标记"按钮</p>
                  <p>🎭 <strong>片尾设置:</strong> 播放到片尾开始位置，点击"📍 标记"按钮</p>
                  <p>💾 设置完成后点击"保存智能配置"即可</p>
                  <p className="mt-2">💡 也可手动输入时间，支持格式: 1:30 (1分30秒) 或 90 (90秒)</p>
                </div>
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={handleSaveBatchSettings}
                className="flex-1 px-6 py-3 bg-linear-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl hover:scale-105 backdrop-blur-sm"
              >
                💾 保存智能配置
              </button>
              <button
                onClick={handleCloseDialog}
                className="flex-1 px-6 py-3 bg-linear-to-r from-gray-400 to-gray-500 hover:from-gray-500 hover:to-gray-600 text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl hover:scale-105 backdrop-blur-sm"
              >
                ❌ 取消
              </button>
            </div>

            {/* 分割线 */}
            <div className="my-6 border-t border-gray-200 dark:border-gray-600"></div>

            {/* 跳过预设组 */}
            <div className="mb-6 bg-linear-to-br from-amber-50/50 to-orange-50/50 dark:from-amber-900/20 dark:to-orange-900/20 p-5 rounded-xl border border-amber-100/50 dark:border-amber-800/50 backdrop-blur-sm">
              <input
                ref={importInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={handleImportPresets}
              />

              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <span className="text-xl">⚡</span>
                    跳过预设组
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    一次设置片头片尾，多影片复用。选择预设后点「套用」，再保存到当前影片。
                  </p>
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {skipPresets.length}/{MAX_PRESET_COUNT}
                </span>
              </div>

              {/* 下拉选择 + 套用 */}
              <div className="flex flex-col md:flex-row gap-2 mb-3">
                <select
                  value={selectedPresetId}
                  onChange={(e) => setSelectedPresetId(e.target.value)}
                  className="flex-1 px-3 py-2.5 border border-amber-300/50 dark:border-amber-600/50 rounded-lg bg-white/80 dark:bg-gray-700/80 text-gray-800 dark:text-gray-100 text-sm focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all"
                >
                  <option value="">选择一个预设</option>
                  {skipPresets.map(preset => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name} · 片头{secondsToTime(preset.openingEnd)}
                      {preset.endingStart > 0 ? ` / 片尾提前${secondsToTime(preset.endingStart)}` : ''}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleApplyPreset}
                  disabled={!selectedPresetId}
                  className="px-4 py-2.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                >
                  套用到当前
                </button>
              </div>

              {/* 从当前配置新建预设 */}
              <div className="flex flex-col md:flex-row gap-2 mb-3">
                <input
                  type="text"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  maxLength={30}
                  className="flex-1 px-3 py-2.5 border border-amber-300/50 dark:border-amber-600/50 rounded-lg bg-white/80 dark:bg-gray-700/80 text-gray-800 dark:text-gray-100 text-sm focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all"
                  placeholder="新建预设名,例如:国产剧通用90s/120s"
                />
                <button
                  onClick={handleCreatePreset}
                  className="px-4 py-2.5 rounded-lg bg-linear-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-sm font-medium transition-all shadow-md hover:shadow-lg hover:scale-105"
                >
                  以当前配置新建
                </button>
              </div>

              {/* 操作按钮行 */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleUpdatePreset}
                  disabled={!selectedPresetId}
                  className="px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-600 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs font-medium"
                >
                  用当前配置覆盖已选
                </button>
                <button
                  onClick={handleDeletePreset}
                  disabled={!selectedPresetId}
                  className="px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-600 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs font-medium"
                >
                  删除已选
                </button>
                <button
                  onClick={handleExportPresets}
                  disabled={skipPresets.length === 0}
                  className="px-3 py-1.5 rounded-lg border border-cyan-300 dark:border-cyan-600 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-100 dark:hover:bg-cyan-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs font-medium"
                >
                  导出预设
                </button>
                <button
                  onClick={() => importInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg border border-cyan-300 dark:border-cyan-600 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-100 dark:hover:bg-cyan-900/30 transition-colors text-xs font-medium"
                >
                  导入预设
                </button>
                {presetFeedback && (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">
                    {presetFeedback}
                  </span>
                )}
              </div>

              {/* 导入确认对话框 */}
              {isImportDialogOpen && (
                <div className="mt-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white/90 dark:bg-gray-900/70 p-3">
                  {(() => {
                    const byName = (name: string) => name.trim().toLowerCase();
                    const overwriteCount = pendingImportedPresets.filter(imp =>
                      skipPresets.some(
                        local => local.id === imp.id || byName(local.name) === byName(imp.name),
                      ),
                    ).length;
                    const addCount = pendingImportedPresets.length - overwriteCount;
                    const conflictNames = Array.from(new Set(
                      skipPresets
                        .filter(local => pendingImportedPresets.some(
                          imp => local.id === imp.id || byName(local.name) === byName(imp.name),
                        ))
                        .map(item => item.name),
                    ));
                    const conflictPreview = conflictNames.slice(0, 10);
                    const hiddenCount = Math.max(conflictNames.length - conflictPreview.length, 0);

                    return (
                      <>
                        <div className="text-sm text-gray-800 dark:text-gray-200 mb-2">
                          检测到 {pendingImportedPresets.length} 条可导入预设
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-300 mb-3">
                          将覆盖 {overwriteCount} 条，新增 {addCount} 条
                        </div>
                        {conflictPreview.length > 0 && (
                          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50/70 p-2 dark:border-amber-700/60 dark:bg-amber-900/20">
                            <div className="mb-1 text-xs text-amber-800 dark:text-amber-300">
                              冲突预设（前 10 条）：
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {conflictPreview.map(name => (
                                <span
                                  key={name}
                                  className="rounded-full border border-amber-300 bg-white/80 px-2 py-0.5 text-xs text-amber-900 dark:border-amber-600 dark:bg-amber-900/40 dark:text-amber-200"
                                >
                                  {name}
                                </span>
                              ))}
                              {hiddenCount > 0 && (
                                <span className="rounded-full border border-amber-300 bg-white/80 px-2 py-0.5 text-xs text-amber-900 dark:border-amber-600 dark:bg-amber-900/40 dark:text-amber-200">
                                  还有 {hiddenCount} 条
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleConfirmImport('merge')}
                      className="px-3 py-1.5 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 transition-colors text-xs font-medium"
                    >
                      合并导入
                    </button>
                    <button
                      onClick={() => handleConfirmImport('overwrite')}
                      className="px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors text-xs font-medium"
                    >
                      覆盖现有
                    </button>
                    <button
                      onClick={() => { setPendingImportedPresets([]); setIsImportDialogOpen(false); }}
                      className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-xs font-medium"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 传统单个设置模式 */}
            <details className="mb-4">
              <summary className="cursor-pointer text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                高级设置：添加单个片段
              </summary>
              <div className="mt-4 space-y-4 pl-4 border-l-2 border-gray-200 dark:border-gray-600">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                    类型
                  </label>
                  <select
                    value={newSegment.type || ''}
                    onChange={(e) => setNewSegment({ ...newSegment, type: e.target.value as 'opening' | 'ending' })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">选择类型</option>
                    <option value="opening">片头</option>
                    <option value="ending">片尾</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                      开始时间 (秒)
                    </label>
                    <input
                      type="number"
                      value={newSegment.start || ''}
                      onChange={(e) => setNewSegment({ ...newSegment, start: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                      结束时间 (秒)
                    </label>
                    <input
                      type="number"
                      value={newSegment.end || ''}
                      onChange={(e) => setNewSegment({ ...newSegment, end: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                </div>

                <button
                  onClick={handleSaveSegment}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
                >
                  添加片段
                </button>
              </div>
            </details>
          </div>
        </div>
      )}

      {/* 管理已有片段 - 优化为可拖动 */}
      {actualSegments.length > 0 && !isSettingMode && (
        <div
          ref={panelRef}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          style={{
            position: 'fixed',
            left: `${position.x}px`,
            top: `${position.y}px`,
            cursor: isDragging ? 'grabbing' : 'default',
            userSelect: isDragging ? 'none' : 'auto',
          }}
          className="z-9998 max-w-sm bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 animate-fade-in"
        >
          <div className="p-3">
            <h4 className="drag-handle font-medium mb-2 text-gray-900 dark:text-gray-100 text-sm flex items-center cursor-move select-none">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
              跳过配置
              <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">可拖动</span>
            </h4>
            <div className="space-y-1">
              {actualSegments.map((segment, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded text-xs"
                >
                  <span className="text-gray-800 dark:text-gray-200 flex-1 mr-2">
                    <span className="font-medium">
                      {segment.type === 'opening' ? '🎬片头' : '🎭片尾'}
                    </span>
                    <br />
                    <span className="text-gray-600 dark:text-gray-400">
                      {formatTime(segment.start)} - {formatTime(segment.end)}
                    </span>
                    {segment.autoSkip && (
                      <span className="ml-1 px-1 bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400 rounded text-xs">
                        自动
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => handleDeleteSegment(index)}
                    className="px-1.5 py-0.5 bg-red-500 hover:bg-red-600 text-white rounded text-xs transition-colors shrink-0"
                    title="删除"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
              <button
                onClick={() => onSettingModeChange?.(true)}
                className="w-full px-2 py-1 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 rounded text-xs transition-colors"
              >
                修改配置
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes scale-in {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
        .animate-scale-in {
          animation: scale-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}

// 导出跳过控制器的设置按钮组件
export function SkipSettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className='group flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-xl rounded-xl border border-white/30 hover:border-white/50 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] hover:shadow-[0_8px_32px_0_rgba(255,255,255,0.18)] hover:scale-105 transition-all duration-300 ease-out'
      title='跳过设置'
      style={{
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      }}
    >
      <svg
        className='w-5 h-5 text-white drop-shadow-lg group-hover:rotate-90 transition-all duration-300'
        fill='none'
        stroke='currentColor'
        viewBox='0 0 24 24'
      >
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          strokeWidth={2}
          d='M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4'
        />
      </svg>
      <span className='text-sm font-medium text-white drop-shadow-lg transition-all duration-300 hidden sm:inline'>
        跳过设置
      </span>
    </button>
  );
}
