/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { useWatchRoom } from '@/hooks/useWatchRoom';
import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import type { Room, Member, ChatMessage } from '@/types/watch-room.types';

export interface WatchRoomContextType {
  socket: any | null;
  isConnected: boolean;
  currentRoom: Room | null;
  members: Member[];
  chatMessages: ChatMessage[];
  isOwner: boolean;
  isEnabled: boolean;
  configLoading: boolean;

  // 房间操作
  createRoom: (data: {
    name: string;
    description: string;
    password?: string;
    isPublic: boolean;
  }) => Promise<Room>;
  joinRoom: (data: {
    roomId: string;
    password?: string;
  }) => Promise<{ room: Room; members: Member[] }>;
  leaveRoom: () => void;
  getRoomList: () => Promise<Room[]>;

  // 聊天
  sendChatMessage: (content: string, type?: 'text' | 'emoji') => void;

  // 播放控制
  updatePlayState: (state: any) => void;
  seekPlayback: (currentTime: number) => void;
  play: () => void;
  pause: () => void;
  changeVideo: (state: any) => void;
  clearRoomState: () => void;
}

const WatchRoomContext = createContext<WatchRoomContextType | null>(null);

export const useWatchRoomContext = () => {
  const context = useContext(WatchRoomContext);
  if (!context) {
    throw new Error('useWatchRoomContext must be used within WatchRoomProvider');
  }
  return context;
};

// 安全版本，可以在非 Provider 内使用
export const useWatchRoomContextSafe = () => {
  return useContext(WatchRoomContext);
};

interface WatchRoomProviderProps {
  children: React.ReactNode;
}

export function WatchRoomProvider({ children }: WatchRoomProviderProps) {
  const [config, setConfig] = useState<{ enabled: boolean; serverUrl: string } | null>(null);
  const [isEnabled, setIsEnabled] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);
  const [authKey, setAuthKey] = useState('');
  const [currentUserName, setCurrentUserName] = useState('游客');
  const [userNameLoaded, setUserNameLoaded] = useState(false);

  // 获取当前登录用户名（持续监听直到获取成功）
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let intervalId: NodeJS.Timeout | null = null;
    let checkCount = 0;
    const maxChecks = 20; // 最多检查20次
    const checkInterval = 500; // 每500ms检查一次

    const checkUsername = () => {
      checkCount++;
      console.log(`[WatchRoom] Checking username (${checkCount}/${maxChecks})...`);
      console.log('[WatchRoom] All cookies:', document.cookie);

      const authInfo = getAuthInfoFromBrowserCookie();
      console.log('[WatchRoom] Auth info:', authInfo);
      const username = authInfo?.username || '游客';

      if (username !== '游客') {
        // 成功获取用户名
        console.log('[WatchRoom] ✓ Username loaded:', username);
        setCurrentUserName(username);
        setUserNameLoaded(true);
        if (intervalId) clearInterval(intervalId);
      } else if (checkCount >= maxChecks) {
        // 达到最大检查次数，放弃
        console.log('[WatchRoom] ✗ Failed to load username after', maxChecks, 'attempts');
        setCurrentUserName('游客');
        setUserNameLoaded(true);
        if (intervalId) clearInterval(intervalId);
      }
    };

    // 立即检查一次
    checkUsername();

    // 如果第一次没成功，启动定时器持续检查
    if (currentUserName === '游客') {
      intervalId = setInterval(checkUsername, checkInterval);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  const watchRoom = useWatchRoom({
    serverUrl: config?.serverUrl || '',
    authKey: authKey,
    userName: currentUserName,
    onError: (error) => console.error('[WatchRoom] Error:', error),
    onDisconnect: () => console.log('[WatchRoom] Disconnected'),
  });

  // 加载配置
  useEffect(() => {
    const loadConfig = async (retryCount = 0) => {
      console.log('[WatchRoom] Loading config... (attempt', retryCount + 1, ')');
      try {
        const response = await fetch('/api/watch-room/config');
        console.log('[WatchRoom] Config response status:', response.status);

        // 如果 401 且是第一次尝试，延迟后重试一次
        if (response.status === 401 && retryCount === 0) {
          console.log('[WatchRoom] Got 401, retrying after delay...');
          setTimeout(() => loadConfig(1), 500);
          return;
        }

        if (response.ok) {
          const data = await response.json();
          console.log('[WatchRoom] Config loaded:', data);
          const enabledValue = data.enabled === true;
          console.log('[WatchRoom] Setting isEnabled to:', enabledValue);
          setConfig(data);
          setIsEnabled(enabledValue);

          // 如果需要 authKey，从完整配置API获取
          if (data.enabled && data.serverUrl) {
            try {
              const authResponse = await fetch('/api/watch-room/config', {
                method: 'POST',
              });
              if (authResponse.ok) {
                const authData = await authResponse.json();
                setAuthKey(authData.authKey || '');
                console.log('[WatchRoom] Auth key loaded');
              }
            } catch (error) {
              console.error('[WatchRoom] Failed to load auth key:', error);
            }
          }
        } else {
          console.error('[WatchRoom] Failed to load config:', response.status);
          setIsEnabled(false);
        }
      } catch (error) {
        console.error('[WatchRoom] Error loading config:', error);
        setIsEnabled(false);
      } finally {
        console.log('[WatchRoom] Config loading finished');
        setConfigLoading(false);
      }
    };

    loadConfig();
  }, []);

  // 连接到服务器
  useEffect(() => {
    if (isEnabled && config?.serverUrl && authKey) {
      console.log('[WatchRoom] Connecting to server...');
      watchRoom.connect();
    }

    return () => {
      if (watchRoom.disconnect) {
        watchRoom.disconnect();
      }
    };
  }, [isEnabled, config, authKey]);

  const contextValue: WatchRoomContextType = {
    socket: watchRoom.socket,
    isConnected: watchRoom.connected,
    currentRoom: watchRoom.currentRoom,
    members: watchRoom.members,
    chatMessages: watchRoom.messages,
    isOwner: watchRoom.isOwner,
    isEnabled,
    configLoading,
    createRoom: async (data) => {
      const result = await watchRoom.createRoom(data);
      if (!result.success || !result.room) {
        throw new Error(result.error || '创建房间失败');
      }
      return result.room;
    },
    joinRoom: async (data) => {
      const result = await watchRoom.joinRoom(data.roomId, data.password);
      if (!result.success || !result.room || !result.members) {
        throw new Error(result.error || '加入房间失败');
      }
      return { room: result.room, members: result.members };
    },
    leaveRoom: watchRoom.leaveRoom,
    getRoomList: watchRoom.getRoomList,
    sendChatMessage: watchRoom.sendMessage,
    updatePlayState: watchRoom.updatePlayState,
    seekPlayback: watchRoom.seekTo,
    play: watchRoom.play,
    pause: watchRoom.pause,
    changeVideo: watchRoom.changeVideo,
    clearRoomState: async () => {
      const result = await watchRoom.clearState();
      if (!result.success) {
        throw new Error(result.error || '清除状态失败');
      }
    },
  };

  return (
    <WatchRoomContext.Provider value={contextValue}>
      {children}
    </WatchRoomContext.Provider>
  );
}
