import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

import type {
  ChatMessage,
  ClientToServerEvents,
  Member,
  PlayState,
  Room,
  ServerToClientEvents,
} from '@/types/watch-room.types';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface UseWatchRoomOptions {
  serverUrl: string;
  authKey: string;
  userName: string;
  onError?: (error: string) => void;
  onDisconnect?: () => void;
}

export interface UseWatchRoomReturn {
  socket: TypedSocket | null;
  connected: boolean;
  currentRoom: Room | null;
  members: Member[];
  messages: ChatMessage[];

  // 房间操作
  createRoom: (data: {
    name: string;
    description: string;
    password?: string;
    isPublic: boolean;
  }) => Promise<{ success: boolean; room?: Room; error?: string }>;

  joinRoom: (roomId: string, password?: string) => Promise<{ success: boolean; room?: Room; members?: Member[]; error?: string }>;

  leaveRoom: () => void;

  getRoomList: () => Promise<Room[]>;

  // 播放控制
  updatePlayState: (state: PlayState) => void;
  seekTo: (currentTime: number) => void;
  play: () => void;
  pause: () => void;
  changeVideo: (state: PlayState) => void;
  clearState: () => Promise<{ success: boolean; error?: string }>;

  // 聊天
  sendMessage: (content: string, type?: 'text' | 'emoji') => void;

  // 连接状态
  connect: () => void;
  disconnect: () => void;
}

export function useWatchRoom(options: UseWatchRoomOptions): UseWatchRoomReturn {
  const { serverUrl, authKey, userName, onError, onDisconnect } = options;

  const [socket, setSocket] = useState<TypedSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 连接到观影室服务器
  const connect = useCallback(() => {
    if (socket) {
      console.log('[WatchRoom] Already connected');
      return;
    }

    console.log('[WatchRoom] Connecting to server:', serverUrl);

    const newSocket = io(serverUrl, {
      auth: {
        token: authKey,
      },
      extraHeaders: {
        Authorization: `Bearer ${authKey}`,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    }) as TypedSocket;

    // 连接成功
    newSocket.on('connect', () => {
      console.log('[WatchRoom] Connected to server');
      setConnected(true);

      // 启动心跳
      heartbeatIntervalRef.current = setInterval(() => {
        newSocket.emit('heartbeat');
      }, 15000); // 每15秒发送一次心跳
    });

    // 连接断开
    newSocket.on('disconnect', (reason) => {
      console.log('[WatchRoom] Disconnected:', reason);
      setConnected(false);
      setCurrentRoom(null);
      setMembers([]);

      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }

      onDisconnect?.();
    });

    // 连接错误
    newSocket.on('error', (error: string) => {
      console.error('[WatchRoom] Error:', error);
      onError?.(error);
    });

    // 房间事件
    newSocket.on('room:created', (room: Room) => {
      console.log('[WatchRoom] Room created:', room);
      setCurrentRoom(room);
      setMembers([]);
      setMessages([]);
    });

    newSocket.on('room:joined', ({ room, members: roomMembers }) => {
      console.log('[WatchRoom] Joined room:', room);
      setCurrentRoom(room);
      setMembers(roomMembers);
      setMessages([]);
    });

    newSocket.on('room:left', () => {
      console.log('[WatchRoom] Left room');
      setCurrentRoom(null);
      setMembers([]);
      setMessages([]);
    });

    newSocket.on('room:member-joined', (member: Member) => {
      console.log('[WatchRoom] Member joined:', member);
      setMembers((prev) => [...prev, member]);
    });

    newSocket.on('room:member-left', (userId: string) => {
      console.log('[WatchRoom] Member left:', userId);
      setMembers((prev) => prev.filter((m) => m.id !== userId));
    });

    newSocket.on('room:deleted', () => {
      console.log('[WatchRoom] Room deleted');
      setCurrentRoom(null);
      setMembers([]);
      setMessages([]);
      onError?.('房间已被删除');
    });

    // 播放事件（由其他组件处理，这里只记录）
    newSocket.on('play:update', (state: PlayState) => {
      console.log('[WatchRoom] Play state updated:', state);
    });

    newSocket.on('play:seek', (currentTime: number) => {
      console.log('[WatchRoom] Seek to:', currentTime);
    });

    newSocket.on('play:play', () => {
      console.log('[WatchRoom] Play');
    });

    newSocket.on('play:pause', () => {
      console.log('[WatchRoom] Pause');
    });

    newSocket.on('play:change', (state: PlayState) => {
      console.log('[WatchRoom] Video changed:', state);
    });

    newSocket.on('state:cleared', () => {
      console.log('[WatchRoom] State cleared');
    });

    // 聊天事件
    newSocket.on('chat:message', (message: ChatMessage) => {
      console.log('[WatchRoom] New message:', message);
      setMessages((prev) => [...prev, message]);
    });

    // 心跳响应
    newSocket.on('heartbeat:pong', () => {
      // console.log('[WatchRoom] Heartbeat pong');
    });

    setSocket(newSocket);
  }, [serverUrl, authKey, onError, onDisconnect, socket]);

  // 断开连接
  const disconnect = useCallback(() => {
    if (socket) {
      console.log('[WatchRoom] Disconnecting...');
      socket.disconnect();
      setSocket(null);
      setConnected(false);
      setCurrentRoom(null);
      setMembers([]);
      setMessages([]);

      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    }
  }, [socket]);

  // 创建房间
  const createRoom = useCallback(async (data: {
    name: string;
    description: string;
    password?: string;
    isPublic: boolean;
  }) => {
    if (!socket || !connected) {
      return { success: false, error: '未连接到服务器' };
    }

    return new Promise<{ success: boolean; room?: Room; error?: string }>((resolve) => {
      socket.emit('room:create', { ...data, userName }, (response) => {
        resolve(response);
      });
    });
  }, [socket, connected, userName]);

  // 加入房间
  const joinRoom = useCallback(async (roomId: string, password?: string) => {
    if (!socket || !connected) {
      return { success: false, error: '未连接到服务器' };
    }

    return new Promise<{ success: boolean; room?: Room; members?: Member[]; error?: string }>((resolve) => {
      socket.emit('room:join', { roomId, password, userName }, (response) => {
        resolve(response);
      });
    });
  }, [socket, connected, userName]);

  // 离开房间
  const leaveRoom = useCallback(() => {
    if (socket && connected) {
      socket.emit('room:leave');
    }
  }, [socket, connected]);

  // 获取房间列表
  const getRoomList = useCallback(async () => {
    if (!socket || !connected) {
      return [];
    }

    return new Promise<Room[]>((resolve) => {
      socket.emit('room:list', (rooms) => {
        resolve(rooms);
      });
    });
  }, [socket, connected]);

  // 播放控制
  const updatePlayState = useCallback((state: PlayState) => {
    if (socket && connected) {
      socket.emit('play:update', state);
    }
  }, [socket, connected]);

  const seekTo = useCallback((currentTime: number) => {
    if (socket && connected) {
      socket.emit('play:seek', currentTime);
    }
  }, [socket, connected]);

  const play = useCallback(() => {
    if (socket && connected) {
      socket.emit('play:play');
    }
  }, [socket, connected]);

  const pause = useCallback(() => {
    if (socket && connected) {
      socket.emit('play:pause');
    }
  }, [socket, connected]);

  const changeVideo = useCallback((state: PlayState) => {
    if (socket && connected) {
      socket.emit('play:change', state);
    }
  }, [socket, connected]);

  const clearState = useCallback(async () => {
    if (!socket || !connected) {
      return { success: false, error: '未连接到服务器' };
    }

    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      socket.emit('state:clear', (response) => {
        if (response) {
          resolve(response);
        } else {
          resolve({ success: true });
        }
      });
    });
  }, [socket, connected]);

  // 发送消息
  const sendMessage = useCallback((content: string, type: 'text' | 'emoji' = 'text') => {
    if (socket && connected && currentRoom) {
      socket.emit('chat:message', { content, type });
    }
  }, [socket, connected, currentRoom]);

  // 清理
  useEffect(() => {
    return () => {
      if (socket) {
        socket.disconnect();
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [socket]);

  return {
    socket,
    connected,
    currentRoom,
    members,
    messages,
    createRoom,
    joinRoom,
    leaveRoom,
    getRoomList,
    updatePlayState,
    seekTo,
    play,
    pause,
    changeVideo,
    clearState,
    sendMessage,
    connect,
    disconnect,
  };
}
