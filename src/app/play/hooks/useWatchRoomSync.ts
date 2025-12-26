// 观影室播放同步Hook (基于 MoonTVPlus 实现，适配外部 watch-room-server)
import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { WatchRoomContextType } from '@/components/WatchRoomProvider';

interface UseWatchRoomSyncOptions {
  watchRoom: WatchRoomContextType | null;
  artPlayerRef: React.MutableRefObject<any>;
  detail: any;
  episodeIndex: number;
  playerReady: boolean;
  videoId: string;  // 视频ID（来自URL参数）
  currentSource: string;  // 当前播放源
}

export function useWatchRoomSync({
  watchRoom,
  artPlayerRef,
  detail,
  episodeIndex,
  playerReady,
  videoId,
  currentSource
}: UseWatchRoomSyncOptions) {
  const router = useRouter();
  const isHandlingRemoteCommandRef = useRef(false);
  const lastSyncTimeRef = useRef(0);

  // 检查是否在房间内
  const isInRoom = !!(watchRoom && watchRoom.currentRoom);
  const isOwner = watchRoom?.isOwner || false;
  const currentRoom = watchRoom?.currentRoom;
  const socket = watchRoom?.socket;

  // 广播播放状态（任何人都可以触发同步）
  const broadcastPlayState = useCallback(() => {
    if (!socket || !watchRoom || !isInRoom) return;

    const player = artPlayerRef.current;
    if (!player) return;

    const state = {
      type: 'play',
      url: player.url || '',
      currentTime: player.currentTime || 0,
      isPlaying: player.playing || false,
      videoId: videoId,  // 使用URL参数的videoId
      videoName: detail?.vod_name || '',
      videoYear: detail?.vod_year || '',
      episode: episodeIndex,
      source: currentSource,  // 使用currentSource参数
    };

    // 使用防抖，避免频繁发送
    const now = Date.now();
    if (now - lastSyncTimeRef.current < 1000) return;
    lastSyncTimeRef.current = now;

    watchRoom.updatePlayState(state);
  }, [socket, watchRoom, artPlayerRef, isInRoom, detail, episodeIndex, videoId, currentSource]);

  // === 1. 接收并同步其他成员的播放状态（所有人都监听）===
  useEffect(() => {
    if (!socket || !currentRoom || !isInRoom) {
      console.log('[PlaySync] Skip setup:', { hasSocket: !!socket, hasRoom: !!currentRoom, isInRoom });
      return;
    }

    console.log('[PlaySync] Setting up event listeners');

    const handlePlayUpdate = (state: any) => {
      console.log('[PlaySync] Received play:update event:', state);
      const player = artPlayerRef.current;

      if (!player) {
        console.warn('[PlaySync] Player not ready for play:update');
        return;
      }

      console.log('[PlaySync] Processing play update - current state:', {
        playerPlaying: player.playing,
        statePlaying: state.isPlaying,
        playerTime: player.currentTime,
        stateTime: state.currentTime
      });

      // 标记正在处理远程命令
      isHandlingRemoteCommandRef.current = true;

      // play:update 只同步进度，不改变播放/暂停状态
      const timeDiff = Math.abs(player.currentTime - state.currentTime);
      if (timeDiff > 2) {
        console.log('[PlaySync] Seeking to:', state.currentTime, '(diff:', timeDiff, 's)');
        player.currentTime = state.currentTime;
        setTimeout(() => {
          isHandlingRemoteCommandRef.current = false;
          console.log('[PlaySync] Reset flag after seek');
        }, 500);
      } else {
        console.log('[PlaySync] Time diff is small, no seek needed');
        isHandlingRemoteCommandRef.current = false;
      }
    };

    const handlePlayCommand = () => {
      console.log('[PlaySync] ========== Received play:play event ==========');
      const player = artPlayerRef.current;

      if (!player) {
        console.warn('[PlaySync] Player not ready for play:play');
        return;
      }

      console.log('[PlaySync] Player state before play:', {
        playing: player.playing,
        currentTime: player.currentTime,
      });

      // 标记正在处理远程命令
      isHandlingRemoteCommandRef.current = true;

      // 只有在暂停状态时才执行播放
      if (!player.playing) {
        console.log('[PlaySync] Executing play command');
        player.play()
          .then(() => {
            console.log('[PlaySync] Play command completed successfully');
            setTimeout(() => {
              isHandlingRemoteCommandRef.current = false;
              console.log('[PlaySync] Reset flag after play');
            }, 500);
          })
          .catch((err: any) => {
            console.error('[PlaySync] Play error:', err);
            isHandlingRemoteCommandRef.current = false;
          });
      } else {
        console.log('[PlaySync] Player already playing, skipping');
        isHandlingRemoteCommandRef.current = false;
      }
      console.log('[PlaySync] ========== End play:play handling ==========');
    };

    const handlePauseCommand = () => {
      console.log('[PlaySync] ========== Received play:pause event ==========');
      const player = artPlayerRef.current;

      if (!player) {
        console.warn('[PlaySync] Player not ready for play:pause');
        return;
      }

      console.log('[PlaySync] Player state before pause:', {
        playing: player.playing,
        currentTime: player.currentTime,
      });

      // 标记正在处理远程命令
      isHandlingRemoteCommandRef.current = true;

      // 只有在播放状态时才执行暂停
      if (player.playing) {
        console.log('[PlaySync] Executing pause command');
        player.pause();
        console.log('[PlaySync] Player state after pause:', {
          playing: player.playing,
          currentTime: player.currentTime,
        });
        setTimeout(() => {
          isHandlingRemoteCommandRef.current = false;
          console.log('[PlaySync] Reset flag after pause');
        }, 500);
      } else {
        console.log('[PlaySync] Player already paused, skipping');
        isHandlingRemoteCommandRef.current = false;
      }
      console.log('[PlaySync] ========== End play:pause handling ==========');
    };

    const handleSeekCommand = (currentTime: number) => {
      console.log('[PlaySync] Received play:seek event:', currentTime);
      const player = artPlayerRef.current;

      if (!player) {
        console.warn('[PlaySync] Player not ready for play:seek');
        return;
      }

      // 标记正在处理远程命令
      isHandlingRemoteCommandRef.current = true;

      console.log('[PlaySync] Executing seek command');
      player.currentTime = currentTime;

      setTimeout(() => {
        isHandlingRemoteCommandRef.current = false;
        console.log('[PlaySync] Reset flag after seek command');
      }, 500);
    };

    const handleChangeCommand = (state: any) => {
      console.log('[PlaySync] Received play:change event:', state);
      console.log('[PlaySync] Current isOwner:', isOwner);

      // 只有房员才处理视频切换命令
      if (isOwner) {
        console.log('[PlaySync] Skipping play:change - user is owner');
        return;
      }

      // 跟随房主切换视频/集数（直接跳转，参考 MoonTVPlus）
      const url = `/play?id=${state.videoId}&source=${encodeURIComponent(state.source)}&index=${state.episode || 0}`;
      console.log('[PlaySync] Member redirecting to:', url);
      router.push(url);
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
  }, [socket, currentRoom, isInRoom, isOwner, detail, episodeIndex, router]);

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
        videoName: detail?.vod_name || '',
        videoYear: detail?.vod_year || '',
        episode: episodeIndex,
        source: currentSource,
      };

      console.log('[PlaySync] Broadcasting play:change:', state);
      watchRoom.changeVideo(state);

      // 更新跟踪值
      lastBroadcastRef.current = currentState;
    }, 500);

    return () => clearTimeout(timer);
  }, [isOwner, socket, currentRoom, isInRoom, watchRoom, videoId, episodeIndex, currentSource, detail, artPlayerRef]);

  return {
    isInRoom,
    isOwner,
  };
}
