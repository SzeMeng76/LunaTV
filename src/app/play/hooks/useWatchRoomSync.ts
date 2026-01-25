// 观影室播放同步Hook (基于 MoonTVPlus 实现，适配外部 watch-room-server)
import { useEffect, useRef, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { WatchRoomContextType } from '@/components/WatchRoomProvider';
import type { PlayState } from '@/types/watch-room.types';

interface UseWatchRoomSyncOptions {
  watchRoom: WatchRoomContextType | null;
  artPlayerRef: React.MutableRefObject<any>;
  detail: any;
  episodeIndex: number;
  playerReady: boolean;
  videoId: string;  // 视频ID（来自URL参数）
  currentSource: string;  // 当前播放源
  videoTitle: string;  // 视频标题
  videoYear: string;  // 视频年份
  videoDoubanId?: number;  // 豆瓣ID（最准确的标识）
  searchTitle?: string;  // 搜索标题（用于搜索时的原始标题）
  setCurrentEpisodeIndex: (index: number) => void;  // 切换集数的函数
}

// 房主当前播放状态（用于成员重新同步）
export interface OwnerPlayState {
  videoId: string;
  source: string;
  episode: number;
  currentTime: number;
  videoName?: string;
  videoYear?: string;
  searchTitle?: string;
  poster?: string;
  totalEpisodes?: number;
  doubanId?: number;  // 豆瓣ID（用于准确判断是否是同一部视频）
}

export function useWatchRoomSync({
  watchRoom,
  artPlayerRef,
  detail,
  episodeIndex,
  playerReady,
  videoId,
  currentSource,
  videoTitle,
  videoYear,
  videoDoubanId,
  searchTitle,
  setCurrentEpisodeIndex
}: UseWatchRoomSyncOptions) {
  const router = useRouter();
  const isHandlingRemoteCommandRef = useRef(false);
  const lastSyncTimeRef = useRef(0);

  // 源切换确认对话框状态
  const [showSourceSwitchDialog, setShowSourceSwitchDialog] = useState(false);
  const [pendingOwnerState, setPendingOwnerState] = useState<OwnerPlayState | null>(null);

  // 同步暂停状态（成员自己切换集数后暂停同步）
  const [syncPaused, setSyncPaused] = useState(false);

  // 保存房主最新的播放状态（用于重新同步）
  const [ownerState, setOwnerState] = useState<OwnerPlayState | null>(null);

  // 房主切换视频/集数时的待确认状态
  const [pendingOwnerChange, setPendingOwnerChange] = useState<OwnerPlayState | null>(null);

  // 标记是否已经处理过初始同步（避免重复跳转）
  const initialSyncDoneRef = useRef(false);

  // 检查是否在房间内
  const isInRoom = !!(watchRoom && watchRoom.currentRoom);
  const isOwner = watchRoom?.isOwner || false;
  const currentRoom = watchRoom?.currentRoom;
  const socket = watchRoom?.socket;

  // 辅助函数：判断是否是同一部视频（优先使用豆瓣ID，否则用 title + year）
  const isSameVideoContent = useCallback((state: OwnerPlayState | PlayState | null) => {
    if (!state) return false;

    // 优先使用豆瓣ID判断（最准确）
    const stateDoubanId = 'doubanId' in state ? state.doubanId : undefined;
    if (videoDoubanId && stateDoubanId) {
      return videoDoubanId === stateDoubanId;
    }

    // 如果没有豆瓣ID，使用 title + year
    const stateVideoName = 'videoName' in state ? state.videoName : '';
    const stateVideoYear = 'videoYear' in state ? state.videoYear : '';

    // 标题和年份都要匹配（标题必须，年份如果有的话也要匹配）
    const titleMatch = stateVideoName === videoTitle;
    const yearMatch = !stateVideoYear || !videoYear || stateVideoYear === videoYear;

    return titleMatch && yearMatch;
  }, [videoTitle, videoYear, videoDoubanId]);

  // 检查是否与房主观看同一视频同一集（用于判断是否同步进度）
  const isSameVideoAndEpisode = useCallback((state: OwnerPlayState | PlayState | null) => {
    if (!state) return false;
    const stateSource = 'source' in state ? state.source : '';
    const stateEpisode = 'episode' in state ? (state.episode || 0) : 0;

    return isSameVideoContent(state) &&
      stateSource === currentSource &&
      stateEpisode === episodeIndex;
  }, [isSameVideoContent, currentSource, episodeIndex]);

  // 检查是否与房主观看同一部剧（不同集也算）
  const isSameVideo = useCallback((state: OwnerPlayState | PlayState | null) => {
    if (!state) return false;
    const stateSource = 'source' in state ? state.source : '';

    return isSameVideoContent(state) && stateSource === currentSource;
  }, [isSameVideoContent, currentSource]);

  // 检查是否是相同视频但不同源
  const isSameVideoButDifferentSource = useCallback((state: OwnerPlayState | PlayState | null) => {
    if (!state) return false;
    const stateSource = 'source' in state ? state.source : '';

    return isSameVideoContent(state) && stateSource !== currentSource;
  }, [isSameVideoContent, currentSource]);

  // 跳转到指定状态（智能切换：同剧切集数，异剧用路由）
  const navigateToState = useCallback((state: OwnerPlayState) => {
    // 使用 title+year 判断是否是同一部剧（而不是 videoId，因为不同源的 ID 不同）
    const titleMatch = state.videoName === videoTitle;
    const yearMatch = !state.videoYear || !videoYear || state.videoYear === videoYear;
    const sourceMatch = state.source === currentSource;
    const isSameShow = titleMatch && yearMatch && sourceMatch;

    if (isSameShow) {
      // 同一部剧，只需要切换集数，不刷新页面
      console.log('[PlaySync] Same show, switching episode:', state.episode);

      if (state.episode !== episodeIndex) {
        setCurrentEpisodeIndex(state.episode);
      }

      // 等待播放器切换集数后，seek 到指定时间
      setTimeout(() => {
        if (artPlayerRef.current && state.currentTime > 0) {
          console.log('[PlaySync] Seeking to:', state.currentTime);
          artPlayerRef.current.currentTime = state.currentTime;
        }
      }, 1000);  // 给播放器足够时间加载新集数

    } else {
      // 不同的剧或不同的源，使用 router.push 跳转（不刷新页面，保持 WebSocket 连接）
      const params = new URLSearchParams();
      params.set('id', state.videoId);
      params.set('source', state.source);
      params.set('index', String(state.episode));
      if (state.currentTime > 0) {
        params.set('t', String(Math.floor(state.currentTime)));
      }
      if (state.videoName) {
        params.set('title', state.videoName);
      }
      if (state.videoYear) {
        params.set('year', state.videoYear);
      }
      if (state.searchTitle) {
        params.set('stitle', state.searchTitle);
      }
      // 添加特殊标记，告诉播放页面需要强制重新加载
      params.set('_reload', Date.now().toString());

      const url = `/play?${params.toString()}`;
      console.log('[PlaySync] Different show or source, navigating with router.push:', url);

      // 使用 router.push 而不是 window.location.href，保持 WebSocket 连接
      router.push(url);

      // 关键修复：在 push 后延迟调用 refresh，确保数据重新加载
      // 参考：https://github.com/vercel/next.js/issues/54766
      setTimeout(() => {
        router.refresh();
        console.log('[PlaySync] Called router.refresh() to reload data');
      }, 100);
    }
  }, [videoTitle, videoYear, currentSource, episodeIndex, setCurrentEpisodeIndex, artPlayerRef, router]);

  // 确认切换源
  const handleConfirmSourceSwitch = useCallback(() => {
    if (pendingOwnerState) {
      console.log('[PlaySync] User confirmed source switch, navigating to:', pendingOwnerState);
      navigateToState(pendingOwnerState);
    }
    setShowSourceSwitchDialog(false);
    setPendingOwnerState(null);
  }, [pendingOwnerState, navigateToState]);

  // 取消切换源，保持当前源
  const handleCancelSourceSwitch = useCallback(() => {
    console.log('[PlaySync] User cancelled source switch, keeping current source');
    setShowSourceSwitchDialog(false);
    setPendingOwnerState(null);
    // 暂停同步，避免后续继续提示
    setSyncPaused(true);
  }, []);

  // 广播播放状态（任何人都可以触发同步）
  const broadcastPlayState = useCallback(() => {
    if (!socket || !watchRoom || !isInRoom) return;

    const player = artPlayerRef.current;
    if (!player) return;

    const state = {
      type: 'play' as const,
      url: player.url || '',
      currentTime: player.currentTime || 0,
      isPlaying: player.playing || false,
      videoId: videoId,
      videoName: videoTitle || detail?.title || '',
      videoYear: videoYear || detail?.year || '',
      searchTitle: searchTitle,
      episode: episodeIndex,
      source: currentSource,
      poster: detail?.poster || '',
      totalEpisodes: detail?.episodes?.length || undefined,
      doubanId: videoDoubanId || detail?.douban_id || undefined,  // 添加豆瓣ID
    };

    // 使用防抖，避免频繁发送
    const now = Date.now();
    if (now - lastSyncTimeRef.current < 1000) return;
    lastSyncTimeRef.current = now;

    watchRoom.updatePlayState(state);
  }, [socket, watchRoom, artPlayerRef, isInRoom, detail, episodeIndex, videoId, currentSource, videoTitle, videoYear]);

  // === -1. 当 videoId 或 currentSource 变化时，重置初始同步标记 ===
  useEffect(() => {
    // 只有成员需要重置，房主不需要
    if (!isOwner && isInRoom) {
      console.log('[PlaySync] Video/Source changed, resetting initial sync flag', { videoId, currentSource });
      initialSyncDoneRef.current = false;
    }
  }, [videoId, currentSource, isOwner, isInRoom]);

  // === 0. 成员加入房间时，检查房主状态并跳转 ===
  useEffect(() => {
    // 只有成员需要处理，房主不需要
    if (isOwner || !isInRoom || !currentRoom) {
      initialSyncDoneRef.current = false;
      return;
    }

    // 当 videoId 或 currentSource 变化时，重置初始同步标记（允许重新检测）
    // 这样当成员切换源或视频时，可以重新触发检测逻辑
    // （注意：不能放在这里直接重置，因为会导致每次 render 都重置）

    // 已经处理过初始同步，跳过
    if (initialSyncDoneRef.current) {
      console.log('[PlaySync] Initial sync already done, skipping');
      return;
    }

    // 检查房间的 currentState（房主当前播放状态）
    const roomState = currentRoom.currentState;
    if (!roomState || roomState.type !== 'play') {
      console.log('[PlaySync] No play state in room, skipping initial sync');
      initialSyncDoneRef.current = true;
      return;
    }

    // 保存房主状态
    const newOwnerState: OwnerPlayState = {
      videoId: roomState.videoId,
      source: roomState.source,
      episode: roomState.episode || 0,
      currentTime: roomState.currentTime || 0,
      videoName: roomState.videoName,
      videoYear: roomState.videoYear,
      searchTitle: roomState.searchTitle,
      poster: roomState.poster,
      totalEpisodes: roomState.totalEpisodes,
      doubanId: roomState.doubanId,  // 添加豆瓣ID
    };
    setOwnerState(newOwnerState);

    // 检查是否与房主观看同一视频同一集
    if (isSameVideoAndEpisode(roomState)) {
      console.log('[PlaySync] Already watching same video and episode, syncing time only');
      // 同步进度（如果播放器已就绪）
      if (playerReady && artPlayerRef.current) {
        const timeDiff = Math.abs(artPlayerRef.current.currentTime - roomState.currentTime);
        if (timeDiff > 2) {
          console.log('[PlaySync] Initial sync - seeking to:', roomState.currentTime);
          artPlayerRef.current.currentTime = roomState.currentTime;
        }
      }
      initialSyncDoneRef.current = true;
      return;
    }

    // 不是同一视频/集数，检查是否是源不同
    if (isSameVideoButDifferentSource(roomState)) {
      // 相同视频但不同源，显示确认对话框
      console.log('[PlaySync] Same video but different source, showing confirmation dialog');
      setPendingOwnerState(newOwnerState);
      setShowSourceSwitchDialog(true);
      initialSyncDoneRef.current = true;
      return;
    }

    // 完全不同的视频，直接跳转
    console.log('[PlaySync] Different video/episode, redirecting to owner content');
    initialSyncDoneRef.current = true;
    navigateToState(newOwnerState);
  }, [isOwner, isInRoom, currentRoom, playerReady, isSameVideoAndEpisode, isSameVideoButDifferentSource, navigateToState, artPlayerRef]);

  // === 1. 接收并同步其他成员的播放状态（所有人都监听）===
  useEffect(() => {
    if (!socket || !currentRoom || !isInRoom) {
      console.log('[PlaySync] Skip setup:', { hasSocket: !!socket, hasRoom: !!currentRoom, isInRoom });
      return;
    }

    console.log('[PlaySync] Setting up event listeners');

    const handlePlayUpdate = (state: PlayState) => {
      console.log('[PlaySync] Received play:update event:', state);

      // 保存房主状态（无论是否同步）
      const newOwnerState: OwnerPlayState = {
        videoId: state.videoId,
        source: state.source,
        episode: state.episode || 0,
        currentTime: state.currentTime || 0,
        videoName: state.videoName,
        videoYear: state.videoYear,
        searchTitle: state.searchTitle,
        poster: state.poster,
        totalEpisodes: state.totalEpisodes,
        doubanId: state.doubanId,  // 添加豆瓣ID
      };
      setOwnerState(newOwnerState);

      // 如果同步已暂停，跳过处理
      if (syncPaused) {
        console.log('[PlaySync] Sync paused, skipping play:update');
        return;
      }

      // 只有观看同一视频同一集时才同步进度
      if (!isSameVideoAndEpisode(state)) {
        console.log('[PlaySync] Different video/episode, skipping progress sync');
        return;
      }

      const player = artPlayerRef.current;
      if (!player) {
        console.warn('[PlaySync] Player not ready for play:update');
        return;
      }

      // 标记正在处理远程命令
      isHandlingRemoteCommandRef.current = true;

      // play:update 只同步进度，不改变播放/暂停状态
      const timeDiff = Math.abs(player.currentTime - state.currentTime);
      if (timeDiff > 2) {
        console.log('[PlaySync] Seeking to:', state.currentTime, '(diff:', timeDiff, 's)');
        player.currentTime = state.currentTime;
        setTimeout(() => {
          isHandlingRemoteCommandRef.current = false;
        }, 500);
      } else {
        isHandlingRemoteCommandRef.current = false;
      }
    };

    const handlePlayCommand = () => {
      console.log('[PlaySync] Received play:play event');

      // 如果同步已暂停，跳过处理
      if (syncPaused) {
        console.log('[PlaySync] Sync paused, skipping play:play');
        return;
      }

      // 只有观看同一视频同一集时才同步播放/暂停
      if (!isSameVideoAndEpisode(ownerState)) {
        console.log('[PlaySync] Different video/episode, skipping play command');
        return;
      }

      const player = artPlayerRef.current;
      if (!player) return;

      isHandlingRemoteCommandRef.current = true;

      if (!player.playing) {
        player.play()
          .then(() => {
            setTimeout(() => {
              isHandlingRemoteCommandRef.current = false;
            }, 500);
          })
          .catch((err: any) => {
            console.error('[PlaySync] Play error:', err);
            isHandlingRemoteCommandRef.current = false;
          });
      } else {
        isHandlingRemoteCommandRef.current = false;
      }
    };

    const handlePauseCommand = () => {
      console.log('[PlaySync] Received play:pause event');

      // 如果同步已暂停，跳过处理
      if (syncPaused) {
        console.log('[PlaySync] Sync paused, skipping play:pause');
        return;
      }

      // 只有观看同一视频同一集时才同步播放/暂停
      if (!isSameVideoAndEpisode(ownerState)) {
        console.log('[PlaySync] Different video/episode, skipping pause command');
        return;
      }

      const player = artPlayerRef.current;
      if (!player) return;

      isHandlingRemoteCommandRef.current = true;

      if (player.playing) {
        player.pause();
        setTimeout(() => {
          isHandlingRemoteCommandRef.current = false;
        }, 500);
      } else {
        isHandlingRemoteCommandRef.current = false;
      }
    };

    const handleSeekCommand = (currentTime: number) => {
      console.log('[PlaySync] Received play:seek event:', currentTime);

      // 如果同步已暂停，跳过处理
      if (syncPaused) {
        console.log('[PlaySync] Sync paused, skipping play:seek');
        return;
      }

      // 只有观看同一视频同一集时才同步进度
      if (!isSameVideoAndEpisode(ownerState)) {
        console.log('[PlaySync] Different video/episode, skipping seek command');
        return;
      }

      const player = artPlayerRef.current;
      if (!player) return;

      isHandlingRemoteCommandRef.current = true;
      player.currentTime = currentTime;

      setTimeout(() => {
        isHandlingRemoteCommandRef.current = false;
      }, 500);
    };

    const handleChangeCommand = (state: PlayState) => {
      console.log('[PlaySync] Received play:change event:', state);

      // 保存房主状态（无论是否同步）
      const newOwnerState: OwnerPlayState = {
        videoId: state.videoId,
        source: state.source,
        episode: state.episode || 0,
        currentTime: state.currentTime || 0,
        videoName: state.videoName,
        videoYear: state.videoYear,
        searchTitle: state.searchTitle,
        poster: state.poster,
        totalEpisodes: state.totalEpisodes,
        doubanId: state.doubanId,  // 添加豆瓣ID
      };
      setOwnerState(newOwnerState);

      // 只有房员才处理视频切换命令
      if (isOwner) {
        console.log('[PlaySync] Skipping play:change - user is owner');
        return;
      }

      // 如果同步已暂停，跳过处理（但更新ownerState以便重新同步）
      if (syncPaused) {
        console.log('[PlaySync] Sync paused, skipping play:change but updating ownerState');
        return;
      }

      // 设置待确认的房主切换状态，让UI显示确认框
      console.log('[PlaySync] Owner changed video, showing confirmation');
      setPendingOwnerChange(newOwnerState);
    };

    // 监听socket事件
    socket.on('play:update', handlePlayUpdate);
    socket.on('play:play', handlePlayCommand);
    socket.on('play:pause', handlePauseCommand);
    socket.on('play:seek', handleSeekCommand);
    socket.on('play:change', handleChangeCommand);

    console.log('[PlaySync] Event listeners registered');

    return () => {
      console.log('[PlaySync] Cleaning up event listeners');
      socket.off('play:update', handlePlayUpdate);
      socket.off('play:play', handlePlayCommand);
      socket.off('play:pause', handlePauseCommand);
      socket.off('play:seek', handleSeekCommand);
      socket.off('play:change', handleChangeCommand);
    };
  }, [socket, currentRoom, isInRoom, isOwner, syncPaused, isSameVideoAndEpisode, ownerState]);

  // === 2. 监听播放器事件并广播（所有人都可以触发同步）===
  useEffect(() => {
    if (!socket || !currentRoom || !isInRoom || !watchRoom) {
      console.log('[PlaySync] Skip player setup:', { hasSocket: !!socket, hasRoom: !!currentRoom, isInRoom, hasWatchRoom: !!watchRoom });
      return;
    }

    if (!playerReady) {
      console.log('[PlaySync] Player not ready yet, waiting...');
      return;
    }

    const player = artPlayerRef.current;
    if (!player) {
      console.warn('[PlaySync] Player ref is null despite playerReady=true');
      return;
    }

    console.log('[PlaySync] Setting up player event listeners');

    const handlePlay = () => {
      // 如果正在处理远程命令，不要广播（避免循环）
      if (isHandlingRemoteCommandRef.current) {
        console.log('[PlaySync] Play event triggered by remote command, not broadcasting');
        return;
      }

      const player = artPlayerRef.current;
      if (!player) return;

      // 确认播放器确实在播放状态才广播
      if (player.playing) {
        console.log('[PlaySync] Play event detected, player is playing, broadcasting...');
        watchRoom.play();
      } else {
        console.log('[PlaySync] Play event detected but player is paused, not broadcasting');
      }
    };

    const handlePause = () => {
      // 如果正在处理远程命令，不要广播（避免循环）
      if (isHandlingRemoteCommandRef.current) {
        console.log('[PlaySync] Pause event triggered by remote command, not broadcasting');
        return;
      }

      const player = artPlayerRef.current;
      if (!player) return;

      // 确认播放器确实在暂停状态才广播
      if (!player.playing) {
        console.log('[PlaySync] Pause event detected, player is paused, broadcasting...');
        watchRoom.pause();
      } else {
        console.log('[PlaySync] Pause event detected but player is playing, not broadcasting');
      }
    };

    const handleSeeked = () => {
      // 如果正在处理远程命令，不要广播（避免循环）
      if (isHandlingRemoteCommandRef.current) {
        console.log('[PlaySync] Seeked event triggered by remote command, not broadcasting');
        return;
      }

      const player = artPlayerRef.current;
      if (!player) return;

      console.log('[PlaySync] Seeked event detected, broadcasting time:', player.currentTime);
      watchRoom.seekPlayback(player.currentTime);
    };

    player.on('play', handlePlay);
    player.on('pause', handlePause);
    player.on('seeked', handleSeeked); // 注意：用 'seeked' 而不是 'seeking'

    // 定期同步播放进度（每5秒）- watch-room-server 只允许房主发送 play:update
    let syncInterval: NodeJS.Timeout | null = null;
    if (isOwner) {
      syncInterval = setInterval(() => {
        if (!player.playing) return; // 暂停时不同步

        console.log('[PlaySync] Periodic sync - broadcasting state (owner only)');
        broadcastPlayState();
      }, 5000);
      console.log('[PlaySync] Player event listeners registered with periodic sync (owner mode)');
    } else {
      console.log('[PlaySync] Player event listeners registered (member mode, no periodic sync)');
    }

    return () => {
      console.log('[PlaySync] Cleaning up player event listeners');
      player.off('play', handlePlay);
      player.off('pause', handlePause);
      player.off('seeked', handleSeeked);
      if (syncInterval) {
        clearInterval(syncInterval);
      }
    };
  }, [socket, currentRoom, watchRoom, broadcastPlayState, isInRoom, playerReady, isOwner]);

  // === 3. 房主：监听视频/集数变化并广播 ===
  const lastBroadcastRef = useRef<{
    videoId: string;
    episode: number;
  } | null>(null);

  useEffect(() => {
    if (!isOwner || !socket || !currentRoom || !isInRoom || !watchRoom) {
      lastBroadcastRef.current = null;
      return;
    }
    if (!videoId) return;  // 使用URL参数的videoId

    const currentState = {
      videoId: videoId,
      episode: episodeIndex,
    };

    // 检查是否需要广播
    const shouldBroadcast = !lastBroadcastRef.current ||
      lastBroadcastRef.current.videoId !== currentState.videoId ||
      lastBroadcastRef.current.episode !== currentState.episode;

    if (!shouldBroadcast) {
      console.log('[PlaySync] No change detected, skipping broadcast');
      return;
    }

    console.log('[PlaySync] Detected change, will broadcast:', {
      from: lastBroadcastRef.current,
      to: currentState
    });

    // 延迟广播，确保页面已经稳定
    const timer = setTimeout(() => {
      const player = artPlayerRef.current;
      const state = {
        type: 'play',
        url: player?.url || '',
        currentTime: player?.currentTime || 0,
        isPlaying: player?.playing || false,
        videoId: videoId,
        videoName: videoTitle || detail?.title || '',
        videoYear: videoYear || detail?.year || '',
        searchTitle: searchTitle,
        episode: episodeIndex,
        source: currentSource,
        poster: detail?.poster || '',
        totalEpisodes: detail?.episodes?.length || undefined,
        doubanId: videoDoubanId || detail?.douban_id || undefined,  // 添加豆瓣ID
      };

      console.log('[PlaySync] Broadcasting play:change:', state);
      watchRoom.changeVideo(state);

      // 更新跟踪值
      lastBroadcastRef.current = currentState;
    }, 500);

    return () => clearTimeout(timer);
  }, [isOwner, socket, currentRoom, isInRoom, watchRoom, videoId, episodeIndex, currentSource, detail, artPlayerRef, videoTitle, videoYear]);

  // 暂停同步（成员自己切换集数时调用）
  const pauseSync = useCallback(() => {
    if (!isOwner && isInRoom) {
      console.log('[PlaySync] Pausing sync');
      setSyncPaused(true);
    }
  }, [isOwner, isInRoom]);

  // 重新同步到房主进度（跳转到房主正在播放的视频/集数/进度）
  const resumeSync = useCallback(() => {
    console.log('[PlaySync] Resuming sync');
    setSyncPaused(false);

    // 如果有保存的房主状态，跳转到房主的视频/集数，并带上进度参数
    if (ownerState && !isOwner) {
      navigateToState(ownerState);
    }
  }, [isOwner, ownerState, navigateToState]);

  // 确认跟随房主切换
  const confirmFollowOwner = useCallback(() => {
    if (pendingOwnerChange) {
      console.log('[PlaySync] Confirmed follow owner');
      navigateToState(pendingOwnerChange);
      setPendingOwnerChange(null);
    }
  }, [pendingOwnerChange, navigateToState]);

  // 拒绝跟随房主，进入自由观看模式
  const rejectFollowOwner = useCallback(() => {
    console.log('[PlaySync] Rejected follow owner, entering free watch mode');
    setSyncPaused(true);
    setPendingOwnerChange(null);
  }, []);

  // 清除待确认状态
  const clearPendingChange = useCallback(() => {
    setPendingOwnerChange(null);
  }, []);

  // 检查是否与房主观看同一部剧（用于判断是否需要显示确认框）
  const isSameVideoAsOwner = useCallback(() => {
    return isSameVideo(ownerState);
  }, [isSameVideo, ownerState]);

  return {
    isInRoom,
    isOwner,
    syncPaused,
    pauseSync,
    resumeSync,
    isSameVideoAsOwner,
    ownerState,
    // 房主切换相关
    pendingOwnerChange,
    confirmFollowOwner,
    rejectFollowOwner,
    clearPendingChange,
    // 源切换确认对话框
    showSourceSwitchDialog,
    pendingOwnerState,
    handleConfirmSourceSwitch,
    handleCancelSourceSwitch,
  };
}
