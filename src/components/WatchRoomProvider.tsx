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

  // 获取当前登录用户名（延迟获取，确保 cookie 已加载）
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // 延迟一点时间确保 cookie 已加载
      const timer = setTimeout(() => {
        const authInfo = getAuthInfoFromBrowserCookie();
        const username = authInfo?.username || '游客';
        setCurrentUserName(username);
        console.log('[WatchRoom] Current user:', username);
      }, 100);

      return () => clearTimeout(timer);
    }
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
