/* eslint-disable no-console */
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

// node:sqlite is only available in Node.js 22.5+; dynamic require avoids
// a hard crash on runtimes that don't ship this built-in (e.g. EdgeOne Pages
// with Node.js 20). The import is deferred to the constructor so the module
// can be loaded safely and will only throw when SqliteStorage is actually
// instantiated on an unsupported runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DatabaseSync = any;

import { AdminConfig } from './admin.types';
import { hashPassword as hashPwd, isHashed, verifyPassword } from './password';
import {
  ContentStat,
  CrashLog,
  EpisodeSkipConfig,
  Favorite,
  IStorage,
  PlayRecord,
  PlayStatsResult,
  Reminder,
  UserPlayStat,
} from './types';

const SEARCH_HISTORY_LIMIT = 20;
const CACHE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 60 分钟

export class SqliteStorage implements IStorage {
  private db!: DatabaseSync;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => DatabaseSync };

    const isBuild = process.env.IS_BUILD_PHASE === 'true';

    if (isBuild) {
      this.db = new DatabaseSync(':memory:');
      this.initTables();
      return;
    }

    const dbPath =
      process.env.SQLITE_DB_PATH ||
      path.join(process.cwd(), 'data', 'lunatv.db');
    const dbDir = path.dirname(dbPath);

    // 自动创建数据库目录
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    console.log(`[SQLite] 正在打开数据库: ${dbPath}`);
    try {
      this.db = new DatabaseSync(dbPath);

      // WAL 模式 — 提升并发读性能
      this.db.exec('PRAGMA journal_mode = WAL');

      this.initTables();

      // 定时清理过期缓存
      this.cleanupTimer = setInterval(() => {
        this.clearExpiredCache().catch((err) => {
          console.error('[SQLite] 缓存清理出错:', err);
        });
      }, CACHE_CLEANUP_INTERVAL_MS);
    } catch (err) {
      console.error(`[SQLite] 打开数据库失败:`, err);
      throw err;
    }

    // 进程退出时关闭数据库
    process.once('exit', () => this.close());
  }

  // ==================== 初始化 & 关闭 ====================

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users_v2 (
        username TEXT PRIMARY KEY,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        banned INTEGER NOT NULL DEFAULT 0,
        tags TEXT,
        enabled_apis TEXT,
        oidc_sub TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_users_v2_oidc_sub ON users_v2(oidc_sub);

      CREATE TABLE IF NOT EXISTS play_records (
        username TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (username, key)
      );

      CREATE TABLE IF NOT EXISTS favorites (
        username TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (username, key)
      );

      CREATE TABLE IF NOT EXISTS reminders (
        username TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (username, key)
      );

      CREATE TABLE IF NOT EXISTS search_history (
        username TEXT NOT NULL,
        keyword TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (username, keyword)
      );

      CREATE TABLE IF NOT EXISTS skip_configs (
        username TEXT NOT NULL,
        source TEXT NOT NULL,
        id TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (username, source, id)
      );

      CREATE TABLE IF NOT EXISTS episode_skip_configs (
        username TEXT NOT NULL,
        source TEXT NOT NULL,
        id TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (username, source, id)
      );

      CREATE TABLE IF NOT EXISTS admin_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS login_stats (
        username TEXT PRIMARY KEY,
        login_count INTEGER NOT NULL DEFAULT 0,
        first_login_time INTEGER,
        last_login_time INTEGER,
        last_login_date INTEGER,
        last_login_ip TEXT,
        last_login_location TEXT,
        last_login_device TEXT,
        last_login_browser TEXT,
        last_login_os TEXT
      );

      CREATE TABLE IF NOT EXISTS emby_configs (
        username TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS crash_logs (
        timestamp TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    console.log('[SQLite] 数据表初始化完成');
  }

  close(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    try {
      this.db.close();
      console.log('[SQLite] 数据库已关闭');
    } catch {
      // 忽略关闭错误
    }
  }

  // ==================== 播放记录 ====================

  async getPlayRecord(
    userName: string,
    key: string,
  ): Promise<PlayRecord | null> {
    const row = this.db
      .prepare('SELECT value FROM play_records WHERE username = ? AND key = ?')
      .get(userName, key) as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as PlayRecord) : null;
  }

  async setPlayRecord(
    userName: string,
    key: string,
    record: PlayRecord,
  ): Promise<void> {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO play_records (username, key, value) VALUES (?, ?, ?)',
      )
      .run(userName, key, JSON.stringify(record));
  }

  async getAllPlayRecords(
    userName: string,
  ): Promise<Record<string, PlayRecord>> {
    const rows = this.db
      .prepare('SELECT key, value FROM play_records WHERE username = ?')
      .all(userName) as Array<{ key: string; value: string }>;
    const result: Record<string, PlayRecord> = {};
    for (const row of rows) {
      result[row.key] = JSON.parse(row.value) as PlayRecord;
    }
    return result;
  }

  async deletePlayRecord(userName: string, key: string): Promise<void> {
    this.db
      .prepare('DELETE FROM play_records WHERE username = ? AND key = ?')
      .run(userName, key);
  }

  async setPlayRecordsBatch(
    userName: string,
    records: Record<string, PlayRecord>,
  ): Promise<void> {
    const entries = Object.entries(records);
    if (entries.length === 0) return;

    const insert = this.db.prepare(
      'INSERT OR REPLACE INTO play_records (username, key, value) VALUES (?, ?, ?)',
    );
    this.db.exec('BEGIN');
    try {
      for (const [key, record] of entries) {
        insert.run(userName, key, JSON.stringify(record));
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  // ==================== 收藏 ====================

  async getFavorite(userName: string, key: string): Promise<Favorite | null> {
    const row = this.db
      .prepare('SELECT value FROM favorites WHERE username = ? AND key = ?')
      .get(userName, key) as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as Favorite) : null;
  }

  async setFavorite(
    userName: string,
    key: string,
    favorite: Favorite,
  ): Promise<void> {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO favorites (username, key, value) VALUES (?, ?, ?)',
      )
      .run(userName, key, JSON.stringify(favorite));
  }

  async getAllFavorites(userName: string): Promise<Record<string, Favorite>> {
    const rows = this.db
      .prepare('SELECT key, value FROM favorites WHERE username = ?')
      .all(userName) as Array<{ key: string; value: string }>;
    const result: Record<string, Favorite> = {};
    for (const row of rows) {
      result[row.key] = JSON.parse(row.value) as Favorite;
    }
    return result;
  }

  async deleteFavorite(userName: string, key: string): Promise<void> {
    this.db
      .prepare('DELETE FROM favorites WHERE username = ? AND key = ?')
      .run(userName, key);
  }

  async setFavoritesBatch(
    userName: string,
    favorites: Record<string, Favorite>,
  ): Promise<void> {
    const entries = Object.entries(favorites);
    if (entries.length === 0) return;

    const insert = this.db.prepare(
      'INSERT OR REPLACE INTO favorites (username, key, value) VALUES (?, ?, ?)',
    );
    this.db.exec('BEGIN');
    try {
      for (const [key, fav] of entries) {
        insert.run(userName, key, JSON.stringify(fav));
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  // ==================== 提醒 ====================

  async getReminder(userName: string, key: string): Promise<Reminder | null> {
    const row = this.db
      .prepare('SELECT value FROM reminders WHERE username = ? AND key = ?')
      .get(userName, key) as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as Reminder) : null;
  }

  async setReminder(
    userName: string,
    key: string,
    reminder: Reminder,
  ): Promise<void> {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO reminders (username, key, value) VALUES (?, ?, ?)',
      )
      .run(userName, key, JSON.stringify(reminder));
  }

  async getAllReminders(userName: string): Promise<Record<string, Reminder>> {
    const rows = this.db
      .prepare('SELECT key, value FROM reminders WHERE username = ?')
      .all(userName) as Array<{ key: string; value: string }>;
    const result: Record<string, Reminder> = {};
    for (const row of rows) {
      result[row.key] = JSON.parse(row.value) as Reminder;
    }
    return result;
  }

  async deleteReminder(userName: string, key: string): Promise<void> {
    this.db
      .prepare('DELETE FROM reminders WHERE username = ? AND key = ?')
      .run(userName, key);
  }

  // ==================== 用户 V1 ====================

  async registerUser(userName: string, password: string): Promise<void> {
    const hashed = hashPwd(password);
    this.db
      .prepare(
        'INSERT OR REPLACE INTO users (username, password_hash, created_at) VALUES (?, ?, ?)',
      )
      .run(userName, hashed, Date.now());
  }

  async verifyUser(userName: string, password: string): Promise<boolean> {
    const row = this.db
      .prepare('SELECT password_hash FROM users WHERE username = ?')
      .get(userName) as { password_hash: string } | undefined;
    if (!row) return false;

    const stored = row.password_hash;
    const ok = verifyPassword(password, stored);

    // 平滑迁移：明文密码 → 加盐哈希
    if (ok && !isHashed(stored)) {
      const hashed = hashPwd(password);
      this.db
        .prepare('UPDATE users SET password_hash = ? WHERE username = ?')
        .run(hashed, userName);
    }

    return ok;
  }

  async checkUserExist(userName: string): Promise<boolean> {
    const row = this.db
      .prepare('SELECT 1 FROM users WHERE username = ?')
      .get(userName);
    return !!row;
  }

  async changePassword(userName: string, newPassword: string): Promise<void> {
    const hashed = hashPwd(newPassword);
    this.db
      .prepare('UPDATE users SET password_hash = ? WHERE username = ?')
      .run(hashed, userName);
  }

  async deleteUser(userName: string): Promise<void> {
    this.db.exec('BEGIN');
    try {
      // V1 用户
      this.db.prepare('DELETE FROM users WHERE username = ?').run(userName);
      // V2 用户
      this.db.prepare('DELETE FROM users_v2 WHERE username = ?').run(userName);
      // 关联数据
      this.db
        .prepare('DELETE FROM play_records WHERE username = ?')
        .run(userName);
      this.db.prepare('DELETE FROM favorites WHERE username = ?').run(userName);
      this.db.prepare('DELETE FROM reminders WHERE username = ?').run(userName);
      this.db
        .prepare('DELETE FROM search_history WHERE username = ?')
        .run(userName);
      this.db
        .prepare('DELETE FROM skip_configs WHERE username = ?')
        .run(userName);
      this.db
        .prepare('DELETE FROM episode_skip_configs WHERE username = ?')
        .run(userName);
      this.db
        .prepare('DELETE FROM login_stats WHERE username = ?')
        .run(userName);
      this.db
        .prepare('DELETE FROM emby_configs WHERE username = ?')
        .run(userName);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  // ==================== 用户 V2（OIDC 支持）====================

  /** V2 密码哈希：Node.js 同步 SHA-256（避免 Web Crypto API 的异步） */
  private hashPasswordV2(password: string): string {
    return createHash('sha256').update(password).digest('hex');
  }

  async createUserV2(
    userName: string,
    password: string,
    role: 'owner' | 'admin' | 'user' = 'user',
    tags?: string[],
    oidcSub?: string,
    enabledApis?: string[],
  ): Promise<void> {
    const hashedPassword = this.hashPasswordV2(password);
    const createdAt = Date.now();

    this.db
      .prepare(
        `INSERT OR REPLACE INTO users_v2
         (username, password, role, banned, tags, enabled_apis, oidc_sub, created_at)
         VALUES (?, ?, ?, 0, ?, ?, ?, ?)`,
      )
      .run(
        userName,
        hashedPassword,
        role,
        tags ? JSON.stringify(tags) : null,
        enabledApis ? JSON.stringify(enabledApis) : null,
        oidcSub || null,
        createdAt,
      );
  }

  async verifyUserV2(userName: string, password: string): Promise<boolean> {
    const row = this.db
      .prepare('SELECT password FROM users_v2 WHERE username = ?')
      .get(userName) as { password: string } | undefined;
    if (!row) return false;
    return row.password === this.hashPasswordV2(password);
  }

  async checkUserExistV2(userName: string): Promise<boolean> {
    const row = this.db
      .prepare('SELECT 1 FROM users_v2 WHERE username = ?')
      .get(userName);
    return !!row;
  }

  async getUserInfoV2(userName: string): Promise<{
    username: string;
    role: 'owner' | 'admin' | 'user';
    tags?: string[];
    enabledApis?: string[];
    banned?: boolean;
    createdAt?: number;
    oidcSub?: string;
  } | null> {
    const row = this.db
      .prepare('SELECT * FROM users_v2 WHERE username = ?')
      .get(userName) as
      | {
          username: string;
          password: string;
          role: string;
          banned: number;
          tags: string | null;
          enabled_apis: string | null;
          oidc_sub: string | null;
          created_at: number;
        }
      | undefined;

    if (!row) return null;

    const parseJsonArray = (val: string | null): string[] | undefined => {
      if (!val) return undefined;
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return val
          .split(',')
          .map((t: string) => t.trim())
          .filter(Boolean);
      }
    };

    return {
      username: row.username,
      role: (row.role as 'owner' | 'admin' | 'user') || 'user',
      banned: row.banned === 1,
      tags: parseJsonArray(row.tags),
      enabledApis: parseJsonArray(row.enabled_apis),
      oidcSub: row.oidc_sub || undefined,
      createdAt: row.created_at,
    };
  }

  async getUserByOidcSub(oidcSub: string): Promise<string | null> {
    const row = this.db
      .prepare('SELECT username FROM users_v2 WHERE oidc_sub = ?')
      .get(oidcSub) as { username: string } | undefined;
    return row ? row.username : null;
  }

  // ==================== 搜索历史 ====================

  async getSearchHistory(userName: string): Promise<string[]> {
    const rows = this.db
      .prepare(
        'SELECT keyword FROM search_history WHERE username = ? ORDER BY created_at DESC',
      )
      .all(userName) as Array<{ keyword: string }>;
    return rows.map((r) => r.keyword);
  }

  async addSearchHistory(userName: string, keyword: string): Promise<void> {
    this.db.exec('BEGIN');
    try {
      // 去重
      this.db
        .prepare(
          'DELETE FROM search_history WHERE username = ? AND keyword = ?',
        )
        .run(userName, keyword);
      // 插入到最前
      this.db
        .prepare(
          'INSERT INTO search_history (username, keyword, created_at) VALUES (?, ?, ?)',
        )
        .run(userName, keyword, Date.now());
      // 限制最大条数
      const count = this.db
        .prepare(
          'SELECT COUNT(*) as cnt FROM search_history WHERE username = ?',
        )
        .get(userName) as { cnt: number };
      if (count.cnt > SEARCH_HISTORY_LIMIT) {
        this.db
          .prepare(
            `DELETE FROM search_history WHERE username = ? AND keyword NOT IN (
              SELECT keyword FROM search_history
              WHERE username = ? ORDER BY created_at DESC LIMIT ?
            )`,
          )
          .run(userName, userName, SEARCH_HISTORY_LIMIT);
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  async deleteSearchHistory(userName: string, keyword?: string): Promise<void> {
    if (keyword) {
      this.db
        .prepare(
          'DELETE FROM search_history WHERE username = ? AND keyword = ?',
        )
        .run(userName, keyword);
    } else {
      this.db
        .prepare('DELETE FROM search_history WHERE username = ?')
        .run(userName);
    }
  }

  // ==================== 用户列表 ====================

  async getAllUsers(): Promise<string[]> {
    // 优先 V2 用户列表
    const v2Rows = this.db
      .prepare('SELECT username FROM users_v2 ORDER BY created_at ASC')
      .all() as Array<{ username: string }>;
    if (v2Rows.length > 0) return v2Rows.map((r) => r.username);

    // V1 降级兜底
    const v1Rows = this.db
      .prepare('SELECT username FROM users ORDER BY created_at ASC')
      .all() as Array<{ username: string }>;
    return v1Rows.map((r) => r.username);
  }

  // ==================== 管理员配置 ====================

  async getAdminConfig(): Promise<AdminConfig | null> {
    const row = this.db
      .prepare('SELECT value FROM admin_config WHERE id = 1')
      .get() as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as AdminConfig) : null;
  }

  async setAdminConfig(config: AdminConfig): Promise<void> {
    this.db
      .prepare('INSERT OR REPLACE INTO admin_config (id, value) VALUES (1, ?)')
      .run(JSON.stringify(config));
  }

  // ==================== 跳过片头片尾配置 ====================

  private skipField(source: string, id: string): string {
    return `${source}+${id}`;
  }

  async getSkipConfig(
    userName: string,
    source: string,
    id: string,
  ): Promise<EpisodeSkipConfig | null> {
    const row = this.db
      .prepare(
        'SELECT value FROM skip_configs WHERE username = ? AND source = ? AND id = ?',
      )
      .get(userName, source, id) as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as EpisodeSkipConfig) : null;
  }

  async setSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: EpisodeSkipConfig,
  ): Promise<void> {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO skip_configs (username, source, id, value) VALUES (?, ?, ?, ?)',
      )
      .run(userName, source, id, JSON.stringify(config));
  }

  async deleteSkipConfig(
    userName: string,
    source: string,
    id: string,
  ): Promise<void> {
    this.db
      .prepare(
        'DELETE FROM skip_configs WHERE username = ? AND source = ? AND id = ?',
      )
      .run(userName, source, id);
  }

  async getAllSkipConfigs(
    userName: string,
  ): Promise<Record<string, EpisodeSkipConfig>> {
    const rows = this.db
      .prepare('SELECT source, id, value FROM skip_configs WHERE username = ?')
      .all(userName) as Array<{ source: string; id: string; value: string }>;
    const result: Record<string, EpisodeSkipConfig> = {};
    for (const row of rows) {
      result[this.skipField(row.source, row.id)] = JSON.parse(
        row.value,
      ) as EpisodeSkipConfig;
    }
    return result;
  }

  // ==================== 剧集跳过配置（新版，多片段支持）====================

  async getEpisodeSkipConfig(
    userName: string,
    source: string,
    id: string,
  ): Promise<EpisodeSkipConfig | null> {
    const row = this.db
      .prepare(
        'SELECT value FROM episode_skip_configs WHERE username = ? AND source = ? AND id = ?',
      )
      .get(userName, source, id) as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as EpisodeSkipConfig) : null;
  }

  async saveEpisodeSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: EpisodeSkipConfig,
  ): Promise<void> {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO episode_skip_configs (username, source, id, value) VALUES (?, ?, ?, ?)',
      )
      .run(userName, source, id, JSON.stringify(config));
  }

  async deleteEpisodeSkipConfig(
    userName: string,
    source: string,
    id: string,
  ): Promise<void> {
    this.db
      .prepare(
        'DELETE FROM episode_skip_configs WHERE username = ? AND source = ? AND id = ?',
      )
      .run(userName, source, id);
  }

  async getAllEpisodeSkipConfigs(
    userName: string,
  ): Promise<Record<string, EpisodeSkipConfig>> {
    const rows = this.db
      .prepare(
        'SELECT source, id, value FROM episode_skip_configs WHERE username = ?',
      )
      .all(userName) as Array<{ source: string; id: string; value: string }>;
    const result: Record<string, EpisodeSkipConfig> = {};
    for (const row of rows) {
      result[this.skipField(row.source, row.id)] = JSON.parse(
        row.value,
      ) as EpisodeSkipConfig;
    }
    return result;
  }

  // ==================== 数据清理 ====================

  async clearAllData(): Promise<void> {
    const tables = [
      'users',
      'users_v2',
      'play_records',
      'favorites',
      'reminders',
      'search_history',
      'skip_configs',
      'episode_skip_configs',
      'admin_config',
      'cache',
      'login_stats',
      'emby_configs',
      'crash_logs',
    ];
    this.db.exec('BEGIN');
    try {
      for (const table of tables) {
        this.db.prepare(`DELETE FROM ${table}`).run();
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    console.log('[SQLite] 所有数据已清空');
  }

  // ==================== 通用缓存 ====================

  async getCache(key: string): Promise<any | null> {
    const row = this.db
      .prepare(
        'SELECT value FROM cache WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)',
      )
      .get(key, Date.now()) as { value: string } | undefined;
    if (!row) return null;

    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  }

  async setCache(
    key: string,
    data: any,
    expireSeconds?: number,
  ): Promise<void> {
    const expiresAt =
      expireSeconds !== undefined ? Date.now() + expireSeconds * 1000 : null;
    this.db
      .prepare(
        'INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, ?)',
      )
      .run(key, JSON.stringify(data), expiresAt);
  }

  async deleteCache(key: string): Promise<void> {
    this.db.prepare('DELETE FROM cache WHERE key = ?').run(key);
  }

  async clearExpiredCache(prefix?: string): Promise<void> {
    const now = Date.now();
    if (prefix) {
      this.db
        .prepare(
          'DELETE FROM cache WHERE key LIKE ? AND expires_at IS NOT NULL AND expires_at <= ?',
        )
        .run(`${prefix}%`, now);
    } else {
      this.db
        .prepare(
          'DELETE FROM cache WHERE expires_at IS NOT NULL AND expires_at <= ?',
        )
        .run(now);
    }
  }

  // ==================== 播放统计 ====================

  async getPlayStats(): Promise<PlayStatsResult> {
    try {
      // 尝试从缓存获取
      const cached = await this.getCache('play_stats_summary');
      if (cached) return cached;

      const allUsers = await this.getAllUsers();
      const now = Date.now();
      const todayStart = new Date(now).setHours(0, 0, 0, 0);
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
      const PROJECT_START = new Date('2025-09-14').getTime();

      const userStats: PlayStatsResult['userStats'] = [];
      let totalWatchTime = 0;
      let totalPlays = 0;
      let todayNewUsers = 0;
      const registrationData: Record<string, number> = {};

      for (const username of allUsers) {
        const userStat = await this.getUserPlayStat(username);
        const userCreatedAt = userStat.firstWatchDate || PROJECT_START;
        const registrationDays =
          Math.floor((now - userCreatedAt) / (1000 * 60 * 60 * 24)) + 1;

        if (userCreatedAt >= todayStart) todayNewUsers++;
        if (userCreatedAt >= sevenDaysAgo) {
          const regDate = new Date(userCreatedAt).toISOString().split('T')[0];
          registrationData[regDate] = (registrationData[regDate] || 0) + 1;
        }

        userStats.push({
          username: userStat.username,
          totalWatchTime: userStat.totalWatchTime,
          totalPlays: userStat.totalPlays,
          lastPlayTime: userStat.lastPlayTime,
          recentRecords: userStat.recentRecords,
          avgWatchTime: userStat.avgWatchTime,
          mostWatchedSource: userStat.mostWatchedSource,
          registrationDays,
          lastLoginTime: userStat.lastPlayTime || userCreatedAt,
          loginCount: userStat.loginCount || 0,
          createdAt: userCreatedAt,
        });

        totalWatchTime += userStat.totalWatchTime;
        totalPlays += userStat.totalPlays;
      }

      // 热门来源
      const sourceMap = new Map<string, number>();
      for (const user of userStats) {
        for (const record of user.recentRecords) {
          sourceMap.set(
            record.source_name,
            (sourceMap.get(record.source_name) || 0) + 1,
          );
        }
      }
      const topSources = Array.from(sourceMap.entries())
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // 近7天每日统计（简化）
      const dailyStats = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now - i * 24 * 60 * 60 * 1000);
        dailyStats.push({
          date: date.toISOString().split('T')[0],
          watchTime: Math.floor(totalWatchTime / 7),
          plays: Math.floor(totalPlays / 7),
        });
      }

      // 注册趋势
      const registrationTrend = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now - i * 24 * 60 * 60 * 1000);
        const dateKey = date.toISOString().split('T')[0];
        registrationTrend.push({
          date: dateKey,
          newUsers: registrationData[dateKey] || 0,
        });
      }

      const result: PlayStatsResult = {
        totalUsers: allUsers.length,
        totalWatchTime,
        totalPlays,
        avgWatchTimePerUser:
          allUsers.length > 0 ? totalWatchTime / allUsers.length : 0,
        avgPlaysPerUser: allUsers.length > 0 ? totalPlays / allUsers.length : 0,
        userStats: userStats.sort(
          (a, b) => b.totalWatchTime - a.totalWatchTime,
        ),
        topSources,
        dailyStats,
        registrationStats: {
          todayNewUsers,
          totalRegisteredUsers: allUsers.length,
          registrationTrend,
        },
        activeUsers: {
          daily: userStats.filter((u) => u.lastLoginTime >= now - 86400000)
            .length,
          weekly: userStats.filter((u) => u.lastLoginTime >= sevenDaysAgo)
            .length,
          monthly: userStats.filter((u) => u.lastLoginTime >= thirtyDaysAgo)
            .length,
        },
      };

      await this.setCache('play_stats_summary', result, 3600);
      return result;
    } catch (error) {
      console.error('[SQLite] getPlayStats 错误:', error);
      return {
        totalUsers: 0,
        totalWatchTime: 0,
        totalPlays: 0,
        avgWatchTimePerUser: 0,
        avgPlaysPerUser: 0,
        userStats: [],
        topSources: [],
        dailyStats: [],
        registrationStats: {
          todayNewUsers: 0,
          totalRegisteredUsers: 0,
          registrationTrend: [],
        },
        activeUsers: { daily: 0, weekly: 0, monthly: 0 },
      };
    }
  }

  async getUserPlayStat(userName: string): Promise<UserPlayStat> {
    try {
      const records = await this.getAllPlayRecords(userName);
      const values = Object.values(records);

      if (values.length === 0) {
        const loginRow = this.db
          .prepare('SELECT * FROM login_stats WHERE username = ?')
          .get(userName) as any;
        const loginStats = loginRow
          ? {
              loginCount: loginRow.login_count || 0,
              firstLoginTime: loginRow.first_login_time || 0,
              lastLoginTime: loginRow.last_login_time || 0,
              lastLoginDate:
                loginRow.last_login_date || loginRow.last_login_time || 0,
            }
          : {
              loginCount: 0,
              firstLoginTime: 0,
              lastLoginTime: 0,
              lastLoginDate: 0,
            };

        return {
          username: userName,
          totalWatchTime: 0,
          totalPlays: 0,
          lastPlayTime: 0,
          recentRecords: [],
          avgWatchTime: 0,
          mostWatchedSource: '',
          totalMovies: 0,
          firstWatchDate: Date.now(),
          lastUpdateTime: Date.now(),
          loginCount: loginStats.loginCount,
          firstLoginTime: loginStats.firstLoginTime,
          lastLoginTime: loginStats.lastLoginTime,
          lastLoginDate: loginStats.lastLoginDate,
          lastLoginIp: loginRow?.last_login_ip ?? undefined,
          lastLoginLocation: loginRow?.last_login_location ?? undefined,
          lastLoginDevice: loginRow?.last_login_device ?? undefined,
          lastLoginBrowser: loginRow?.last_login_browser ?? undefined,
          lastLoginOs: loginRow?.last_login_os ?? undefined,
        };
      }

      const totalWatchTime = values.reduce(
        (sum, r) => sum + (r.play_time || 0),
        0,
      );
      const totalPlays = values.length;
      const lastPlayTime = Math.max(...values.map((r) => r.save_time || 0));
      const totalMovies = new Set(
        values.map((r) => `${r.title}_${r.source_name}_${r.year}`),
      ).size;
      const firstWatchDate = Math.min(
        ...values.map((r) => r.save_time || Date.now()),
      );
      const recentRecords = values
        .sort((a, b) => (b.save_time || 0) - (a.save_time || 0))
        .slice(0, 10);
      const avgWatchTime = totalPlays > 0 ? totalWatchTime / totalPlays : 0;

      const sourceMap = new Map<string, number>();
      values.forEach((r) => {
        const name = r.source_name || '未知来源';
        sourceMap.set(name, (sourceMap.get(name) || 0) + 1);
      });
      const mostWatchedSource =
        sourceMap.size > 0
          ? Array.from(sourceMap.entries()).reduce((a, b) =>
              a[1] > b[1] ? a : b,
            )[0]
          : '';

      const loginRow = this.db
        .prepare('SELECT * FROM login_stats WHERE username = ?')
        .get(userName) as any;
      const loginStats = loginRow
        ? {
            loginCount: loginRow.login_count || 0,
            firstLoginTime: loginRow.first_login_time || 0,
            lastLoginTime: loginRow.last_login_time || 0,
            lastLoginDate:
              loginRow.last_login_date || loginRow.last_login_time || 0,
          }
        : {
            loginCount: 0,
            firstLoginTime: 0,
            lastLoginTime: 0,
            lastLoginDate: 0,
          };

      return {
        username: userName,
        totalWatchTime,
        totalPlays,
        lastPlayTime,
        recentRecords,
        avgWatchTime,
        mostWatchedSource,
        totalMovies,
        firstWatchDate,
        lastUpdateTime: Date.now(),
        loginCount: loginStats.loginCount,
        firstLoginTime: loginStats.firstLoginTime,
        lastLoginTime: loginStats.lastLoginTime,
        lastLoginDate: loginStats.lastLoginDate,
        lastLoginIp: loginRow?.last_login_ip ?? undefined,
        lastLoginLocation: loginRow?.last_login_location ?? undefined,
        lastLoginDevice: loginRow?.last_login_device ?? undefined,
        lastLoginBrowser: loginRow?.last_login_browser ?? undefined,
        lastLoginOs: loginRow?.last_login_os ?? undefined,
      };
    } catch (error) {
      console.error(`[SQLite] getUserPlayStat 错误 (${userName}):`, error);
      return {
        username: userName,
        totalWatchTime: 0,
        totalPlays: 0,
        lastPlayTime: 0,
        recentRecords: [],
        avgWatchTime: 0,
        mostWatchedSource: '',
        totalMovies: 0,
        firstWatchDate: Date.now(),
        lastUpdateTime: Date.now(),
        loginCount: 0,
        firstLoginTime: 0,
        lastLoginTime: 0,
        lastLoginDate: 0,
      };
    }
  }

  async getContentStats(limit = 10): Promise<ContentStat[]> {
    try {
      // 使用 SQL 聚合分组，避免 json_extract 依赖
      const grouped = this.db
        .prepare(
          `SELECT key, COUNT(*) as play_count, COUNT(DISTINCT username) as unique_users
           FROM play_records
           GROUP BY key
           ORDER BY play_count DESC
           LIMIT ?`,
        )
        .all(limit) as Array<{
        key: string;
        play_count: number;
        unique_users: number;
      }>;

      if (grouped.length === 0) return [];

      // 批量获取记录详情
      const keys = grouped.map((r) => r.key);
      const placeholders = keys.map(() => '?').join(',');
      const allRecords = this.db
        .prepare(
          `SELECT key, value FROM play_records WHERE key IN (${placeholders})`,
        )
        .all(...keys) as Array<{ key: string; value: string }>;

      // 按 key 分组
      const recordsByKey = new Map<string, string[]>();
      for (const r of allRecords) {
        if (!recordsByKey.has(r.key)) recordsByKey.set(r.key, []);
        recordsByKey.get(r.key)!.push(r.value);
      }

      return grouped
        .map((row) => {
          const entries = recordsByKey.get(row.key) || [];
          const totalWatchTime = entries.reduce((sum, v) => {
            try {
              return sum + (JSON.parse(v).play_time || 0);
            } catch {
              return sum;
            }
          }, 0);
          const firstVal = entries.length > 0 ? entries[0] : null;
          if (!firstVal) return null;
          const record = JSON.parse(firstVal) as PlayRecord;
          const sep = row.key.indexOf('+');
          const source = sep >= 0 ? row.key.substring(0, sep) : '';
          const id = sep >= 0 ? row.key.substring(sep + 1) : row.key;
          return {
            source,
            id,
            title: record.title,
            source_name: record.source_name,
            cover: record.cover,
            year: record.year,
            playCount: row.play_count,
            totalWatchTime,
            averageWatchTime:
              row.play_count > 0 ? totalWatchTime / row.play_count : 0,
            lastPlayed: record.save_time,
            uniqueUsers: row.unique_users,
          };
        })
        .filter(Boolean) as ContentStat[];
    } catch (error) {
      console.error('[SQLite] getContentStats 错误:', error);
      return [];
    }
  }

  async updatePlayStatistics(
    _userName: string,
    _source: string,
    _id: string,
    _watchTime: number,
  ): Promise<void> {
    try {
      await this.deleteCache('play_stats_summary');
    } catch (error) {
      console.error('[SQLite] updatePlayStatistics 错误:', error);
    }
  }

  async updateUserLoginStats(
    userName: string,
    loginTime: number,
    isFirstLogin?: boolean,
    loginMeta?: { ip?: string; location?: string; device?: string; browser?: string; os?: string }
  ): Promise<void> {
    const row = this.db
      .prepare('SELECT * FROM login_stats WHERE username = ?')
      .get(userName) as any;
    const stats = row || {
      login_count: 0,
      first_login_time: null,
      last_login_time: null,
      last_login_date: null,
    };

    const loginCount = (stats.login_count || 0) + 1;
    const firstLoginTime =
      isFirstLogin || !stats.first_login_time
        ? loginTime
        : stats.first_login_time;

    this.db
      .prepare(
        `INSERT OR REPLACE INTO login_stats
         (username, login_count, first_login_time, last_login_time, last_login_date,
          last_login_ip, last_login_location, last_login_device, last_login_browser, last_login_os)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userName, loginCount, firstLoginTime, loginTime, loginTime,
        loginMeta?.ip ?? (row?.last_login_ip ?? null),
        loginMeta?.location ?? (row?.last_login_location ?? null),
        loginMeta?.device ?? (row?.last_login_device ?? null),
        loginMeta?.browser ?? (row?.last_login_browser ?? null),
        loginMeta?.os ?? (row?.last_login_os ?? null),
      );
  }

  // ==================== Emby 配置 ====================

  async getUserEmbyConfig(userName: string): Promise<any | null> {
    const row = this.db
      .prepare('SELECT value FROM emby_configs WHERE username = ?')
      .get(userName) as { value: string } | undefined;
    return row ? JSON.parse(row.value) : null;
  }

  async saveUserEmbyConfig(userName: string, config: any): Promise<void> {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO emby_configs (username, value) VALUES (?, ?)',
      )
      .run(userName, JSON.stringify(config));
  }

  async deleteUserEmbyConfig(userName: string): Promise<void> {
    this.db
      .prepare('DELETE FROM emby_configs WHERE username = ?')
      .run(userName);
  }

  // ==================== 崩溃日志 ====================

  async saveCrashLog(crashLog: CrashLog): Promise<void> {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO crash_logs (timestamp, value, created_at) VALUES (?, ?, ?)',
      )
      .run(crashLog.timestamp, JSON.stringify(crashLog), Date.now());
  }

  async getCrashLogs(limit = 50): Promise<CrashLog[]> {
    const rows = this.db
      .prepare('SELECT value FROM crash_logs ORDER BY created_at DESC LIMIT ?')
      .all(limit) as Array<{ value: string }>;
    return rows.map((r) => JSON.parse(r.value) as CrashLog);
  }

  async deleteCrashLog(timestamp: string): Promise<void> {
    this.db
      .prepare('DELETE FROM crash_logs WHERE timestamp = ?')
      .run(timestamp);
  }

  async clearCrashLogs(): Promise<void> {
    this.db.prepare('DELETE FROM crash_logs').run();
  }
}
