/* eslint-disable no-console,@typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';

import { getConfig, refineConfig } from '@/lib/config';
import { db } from '@/lib/db';
import { fetchVideoDetail } from '@/lib/fetchVideoDetail';
import { refreshLiveChannels } from '@/lib/live';
import { SearchResult } from '@/lib/types';

export const runtime = 'nodejs';

// 添加全局锁避免并发执行
let isRunning = false;

export async function GET(request: NextRequest) {
  console.log(request.url);

  if (isRunning) {
    console.log('⚠️ Cron job 已在运行中，跳过此次请求');
    return NextResponse.json({
      success: false,
      message: 'Cron job already running',
      timestamp: new Date().toISOString(),
    });
  }

  try {
    isRunning = true;
    console.log('Cron job triggered:', new Date().toISOString());

    await cronJob();

    return NextResponse.json({
      success: true,
      message: 'Cron job executed successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Cron job failed:', error);

    return NextResponse.json(
      {
        success: false,
        message: 'Cron job failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  } finally {
    isRunning = false;
  }
}

async function cronJob() {
  console.log('🚀 开始执行定时任务...');

  // 优先执行用户清理任务，避免被其他任务阻塞
  try {
    console.log('🧹 执行用户清理任务...');
    await cleanupInactiveUsers();
    console.log('✅ 用户清理任务完成');
  } catch (err) {
    console.error('❌ 用户清理任务失败:', err);
  }

  try {
    console.log('📝 刷新配置...');
    await refreshConfig();
    console.log('✅ 配置刷新完成');
  } catch (err) {
    console.error('❌ 配置刷新失败:', err);
  }

  try {
    console.log('📺 刷新直播频道...');
    await refreshAllLiveChannels();
    console.log('✅ 直播频道刷新完成');
  } catch (err) {
    console.error('❌ 直播频道刷新失败:', err);
  }

  try {
    console.log('📊 刷新播放记录和收藏...');
    await refreshRecordAndFavorites();
    console.log('✅ 播放记录和收藏刷新完成');
  } catch (err) {
    console.error('❌ 播放记录和收藏刷新失败:', err);
  }

  console.log('🎉 定时任务执行完成');
}

async function refreshAllLiveChannels() {
  const config = await getConfig();

  // 并发刷新所有启用的直播源
  const refreshPromises = (config.LiveConfig || [])
    .filter(liveInfo => !liveInfo.disabled)
    .map(async (liveInfo) => {
      try {
        const nums = await refreshLiveChannels(liveInfo);
        liveInfo.channelNumber = nums;
      } catch (error) {
        console.error(`刷新直播源失败 [${liveInfo.name || liveInfo.key}]:`, error);
        liveInfo.channelNumber = 0;
      }
    });

  // 等待所有刷新任务完成
  await Promise.all(refreshPromises);

  // 保存配置
  await db.saveAdminConfig(config);
}

async function refreshConfig() {
  let config = await getConfig();
  if (config && config.ConfigSubscribtion && config.ConfigSubscribtion.URL && config.ConfigSubscribtion.AutoUpdate) {
    try {
      console.log('🌐 开始获取配置订阅:', config.ConfigSubscribtion.URL);

      // 设置30秒超时
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(config.ConfigSubscribtion.URL, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'LunaTV-ConfigFetcher/1.0'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`请求失败: ${response.status} ${response.statusText}`);
      }

      const configContent = await response.text();

      // 对 configContent 进行 base58 解码
      let decodedContent;
      try {
        const bs58 = (await import('bs58')).default;
        const decodedBytes = bs58.decode(configContent);
        decodedContent = new TextDecoder().decode(decodedBytes);
      } catch (decodeError) {
        console.warn('Base58 解码失败:', decodeError);
        throw decodeError;
      }

      try {
        JSON.parse(decodedContent);
      } catch (e) {
        throw new Error('配置文件格式错误，请检查 JSON 语法');
      }
      config.ConfigFile = decodedContent;
      config.ConfigSubscribtion.LastCheck = new Date().toISOString();
      config = refineConfig(config);
      await db.saveAdminConfig(config);
    } catch (e) {
      console.error('刷新配置失败:', e);
    }
  } else {
    console.log('跳过刷新：未配置订阅地址或自动更新');
  }
}

async function refreshRecordAndFavorites() {
  try {
    const users = await db.getAllUsers();
    console.log('📋 数据库中的用户列表:', users);
    
    if (process.env.USERNAME && !users.includes(process.env.USERNAME)) {
      users.push(process.env.USERNAME);
      console.log(`➕ 添加环境变量用户: ${process.env.USERNAME}`);
    }
    
    console.log('📋 最终处理用户列表:', users);
    // 函数级缓存：key 为 `${source}+${id}`，值为 Promise<VideoDetail | null>
    const detailCache = new Map<string, Promise<SearchResult | null>>();

    // 获取详情 Promise（带缓存和错误处理）
    const getDetail = async (
      source: string,
      id: string,
      fallbackTitle: string
    ): Promise<SearchResult | null> => {
      const key = `${source}+${id}`;
      let promise = detailCache.get(key);
      if (!promise) {
        promise = fetchVideoDetail({
          source,
          id,
          fallbackTitle: fallbackTitle.trim(),
        })
          .then((detail) => {
            // 成功时才缓存结果
            const successPromise = Promise.resolve(detail);
            detailCache.set(key, successPromise);
            return detail;
          })
          .catch((err) => {
            console.error(`获取视频详情失败 (${source}+${id}):`, err);
            return null;
          });
      }
      return promise;
    };

    for (const user of users) {
      console.log(`开始处理用户: ${user}`);
      
      // 检查用户是否真的存在
      const userExists = await db.checkUserExist(user);
      console.log(`用户 ${user} 是否存在: ${userExists}`);

      // 播放记录
      try {
        const playRecords = await db.getAllPlayRecords(user);
        const totalRecords = Object.keys(playRecords).length;
        let processedRecords = 0;

        for (const [key, record] of Object.entries(playRecords)) {
          try {
            const [source, id] = key.split('+');
            if (!source || !id) {
              console.warn(`跳过无效的播放记录键: ${key}`);
              continue;
            }

            const detail = await getDetail(source, id, record.title);
            if (!detail) {
              console.warn(`跳过无法获取详情的播放记录: ${key}`);
              continue;
            }

            const episodeCount = detail.episodes?.length || 0;
            if (episodeCount > 0 && episodeCount !== record.total_episodes) {
              await db.savePlayRecord(user, source, id, {
                title: detail.title || record.title,
                source_name: record.source_name,
                cover: detail.poster || record.cover,
                index: record.index,
                total_episodes: episodeCount,
                play_time: record.play_time,
                year: detail.year || record.year,
                total_time: record.total_time,
                save_time: record.save_time,
                search_title: record.search_title,
              });
              console.log(
                `更新播放记录: ${record.title} (${record.total_episodes} -> ${episodeCount})`
              );
            }

            processedRecords++;
          } catch (err) {
            console.error(`处理播放记录失败 (${key}):`, err);
            // 继续处理下一个记录
          }
        }

        console.log(`播放记录处理完成: ${processedRecords}/${totalRecords}`);
      } catch (err) {
        console.error(`获取用户播放记录失败 (${user}):`, err);
      }

      // 收藏
      try {
        let favorites = await db.getAllFavorites(user);
        favorites = Object.fromEntries(
          Object.entries(favorites).filter(([_, fav]) => fav.origin !== 'live')
        );
        const totalFavorites = Object.keys(favorites).length;
        let processedFavorites = 0;

        for (const [key, fav] of Object.entries(favorites)) {
          try {
            const [source, id] = key.split('+');
            if (!source || !id) {
              console.warn(`跳过无效的收藏键: ${key}`);
              continue;
            }

            const favDetail = await getDetail(source, id, fav.title);
            if (!favDetail) {
              console.warn(`跳过无法获取详情的收藏: ${key}`);
              continue;
            }

            const favEpisodeCount = favDetail.episodes?.length || 0;
            if (favEpisodeCount > 0 && favEpisodeCount !== fav.total_episodes) {
              await db.saveFavorite(user, source, id, {
                title: favDetail.title || fav.title,
                source_name: fav.source_name,
                cover: favDetail.poster || fav.cover,
                year: favDetail.year || fav.year,
                total_episodes: favEpisodeCount,
                save_time: fav.save_time,
                search_title: fav.search_title,
              });
              console.log(
                `更新收藏: ${fav.title} (${fav.total_episodes} -> ${favEpisodeCount})`
              );
            }

            processedFavorites++;
          } catch (err) {
            console.error(`处理收藏失败 (${key}):`, err);
            // 继续处理下一个收藏
          }
        }

        console.log(`收藏处理完成: ${processedFavorites}/${totalFavorites}`);
      } catch (err) {
        console.error(`获取用户收藏失败 (${user}):`, err);
      }
    }

    console.log('刷新播放记录/收藏任务完成');
  } catch (err) {
    console.error('刷新播放记录/收藏任务启动失败', err);
  }
}

async function cleanupInactiveUsers() {
  try {
    console.log('🔧 正在获取配置...');
    const config = await getConfig();
    console.log('✅ 配置获取成功');

    // 清理策略：基于登入时间而不是播放记录
    // 删除条件：注册时间 >= X天 且 (从未登入 或 最后登入时间 >= X天)

    // 预热 Redis 连接，避免冷启动
    console.log('🔥 预热数据库连接...');
    try {
      await db.getAllUsers();
      console.log('✅ 数据库连接预热成功');
    } catch (warmupErr) {
      console.warn('⚠️ 数据库连接预热失败:', warmupErr);
    }

    // 检查是否启用自动清理功能
    const autoCleanupEnabled = config.UserConfig?.AutoCleanupInactiveUsers ?? false;
    const inactiveUserDays = config.UserConfig?.InactiveUserDays ?? 7;

    console.log(`📋 清理配置: 启用=${autoCleanupEnabled}, 保留天数=${inactiveUserDays}`);

    if (!autoCleanupEnabled) {
      console.log('⏭️ 自动清理非活跃用户功能已禁用，跳过清理任务');
      return;
    }

    console.log('🧹 开始清理非活跃用户...');

    const allUsers = config.UserConfig.Users;
    console.log('✅ 获取用户列表成功，共', allUsers.length, '个用户');

    const envUsername = process.env.USERNAME;
    console.log('✅ 环境变量用户名:', envUsername);

    const cutoffTime = Date.now() - (inactiveUserDays * 24 * 60 * 60 * 1000);
    console.log('✅ 计算截止时间成功:', new Date(cutoffTime).toISOString());

    let deletedCount = 0;

    console.log('📊 即将开始用户循环...');

    for (const user of allUsers) {
      try {
        console.log(`👤 正在检查用户: ${user.username} (角色: ${user.role})`);

        // 跳过管理员和owner用户
        if (user.role === 'admin' || user.role === 'owner') {
          console.log(`  ⏭️ 跳过管理员用户: ${user.username}`);
          continue;
        }

        // 跳过环境变量中的用户
        if (user.username === envUsername) {
          console.log(`  ⏭️ 跳过环境变量用户: ${user.username}`);
          continue;
        }

        const userCreatedAt = user.createdAt || Date.now(); // 如果没有创建时间，使用当前时间（不会被删除）

        // 先基于时间进行预筛选，避免不必要的数据库调用
        const isOldEnough = userCreatedAt < cutoffTime;
        console.log(`  ⏰ 时间检查: 注册于 ${new Date(userCreatedAt).toISOString()}, 是否超过${inactiveUserDays}天: ${isOldEnough}`);

        if (!isOldEnough) {
          console.log(`  ✅ 保留用户 ${user.username}: 注册时间不足${inactiveUserDays}天`);
          continue;
        }

        // 只对时间符合的用户进行数据库检查
        console.log(`  🔍 检查用户是否存在于数据库: ${user.username}`);
        let userExists = true;
        try {
          userExists = await Promise.race([
            db.checkUserExist(user.username),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('checkUserExist超时')), 5000)
            )
          ]) as boolean;
          console.log(`  📝 用户存在状态: ${userExists}`);
        } catch (err) {
          console.error(`  ❌ 检查用户存在状态失败: ${err}, 跳过该用户`);
          continue;
        }

        if (!userExists) {
          console.log(`  ⚠️ 用户 ${user.username} 在配置中存在但数据库中不存在，跳过处理`);
          continue;
        }

        // 获取用户统计信息（5秒超时）
        console.log(`  📊 获取用户统计信息: ${user.username}`);
        let userStats;
        try {
          userStats = await Promise.race([
            db.getUserPlayStat(user.username),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('getUserPlayStat超时')), 5000)
            )
          ]) as { lastLoginTime?: number; firstLoginTime?: number; loginCount?: number; [key: string]: any };
          console.log(`  📈 用户统计结果:`, userStats);
        } catch (err) {
          console.error(`  ❌ 获取用户统计失败: ${err}, 跳过该用户`);
          continue;
        }

        // 检查是否满足删除条件：基于登入时间而不是播放记录
        const lastLoginTime = userStats.lastLoginTime || userStats.lastLoginDate || userStats.firstLoginTime || 0;
        const hasNeverLoggedIn = lastLoginTime === 0 || (userStats.loginCount || 0) === 0;
        const loginTooOld = lastLoginTime > 0 && lastLoginTime < cutoffTime;

        // 删除条件：注册时间够久 且 (从未登入 或 最后登入时间超过阈值)
        const shouldDelete = isOldEnough && (hasNeverLoggedIn || loginTooOld);

        if (shouldDelete) {
          const deleteReason = hasNeverLoggedIn ? '从未登入' : `最后登入时间过久: ${new Date(lastLoginTime).toISOString()}`;
          console.log(`🗑️ 删除非活跃用户: ${user.username} (注册于: ${new Date(userCreatedAt).toISOString()}, 登入次数: ${userStats.loginCount || 0}, 原因: ${deleteReason}, 阈值: ${inactiveUserDays}天)`);

          // 从数据库删除用户数据
          await db.deleteUser(user.username);

          // 从配置中移除用户
          const userIndex = config.UserConfig.Users.findIndex(u => u.username === user.username);
          if (userIndex !== -1) {
            config.UserConfig.Users.splice(userIndex, 1);
          }

          deletedCount++;
        } else {
          let reason;
          if (!isOldEnough) {
            reason = `注册时间不足${inactiveUserDays}天`;
          } else if (!hasNeverLoggedIn && !loginTooOld) {
            reason = `最近有登入活动 (最后登入: ${lastLoginTime > 0 ? new Date(lastLoginTime).toISOString() : '未知'})`;
          } else {
            reason = '其他原因';
          }
          console.log(`✅ 保留用户 ${user.username}: ${reason}`);
        }

      } catch (err) {
        console.error(`❌ 处理用户 ${user.username} 时出错:`, err);
      }
    }

    // 如果有删除操作，保存更新后的配置
    if (deletedCount > 0) {
      await db.saveAdminConfig(config);
      console.log(`✨ 清理完成，共删除 ${deletedCount} 个非活跃用户`);
    } else {
      console.log('✨ 清理完成，无需删除任何用户');
    }

    // 优化活跃用户的统计显示（等级系统）
    console.log('🎯 开始优化活跃用户等级显示...');
    await optimizeActiveUserLevels();

  } catch (err) {
    console.error('🚫 清理非活跃用户任务失败:', err);
  }
}

// 用户等级定义
const USER_LEVELS = [
  { level: 1, name: "新星观众", icon: "🌟", minLogins: 1, maxLogins: 9, description: "刚刚开启观影之旅" },
  { level: 2, name: "常客影迷", icon: "🎬", minLogins: 10, maxLogins: 49, description: "热爱电影的观众" },
  { level: 3, name: "资深观众", icon: "📺", minLogins: 50, maxLogins: 199, description: "对剧集有独特品味" },
  { level: 4, name: "影院达人", icon: "🎭", minLogins: 200, maxLogins: 499, description: "深度电影爱好者" },
  { level: 5, name: "观影专家", icon: "🏆", minLogins: 500, maxLogins: 999, description: "拥有丰富观影经验" },
  { level: 6, name: "传奇影神", icon: "👑", minLogins: 1000, maxLogins: 2999, description: "影视界的传奇人物" },
  { level: 7, name: "殿堂影帝", icon: "💎", minLogins: 3000, maxLogins: 9999, description: "影视殿堂的至尊" },
  { level: 8, name: "永恒之光", icon: "✨", minLogins: 10000, maxLogins: Infinity, description: "永恒闪耀的观影之光" }
];

function calculateUserLevel(loginCount: number) {
  for (const level of USER_LEVELS) {
    if (loginCount >= level.minLogins && loginCount <= level.maxLogins) {
      return level;
    }
  }
  return USER_LEVELS[USER_LEVELS.length - 1];
}

async function optimizeActiveUserLevels() {
  try {
    const allUsers = await db.getAllUsers();
    let optimizedCount = 0;

    for (const user of allUsers) {
      try {
        // 检查用户是否存在
        const userExists = await db.checkUserExist(user);
        if (!userExists) continue;

        const userStats = await db.getUserPlayStat(user);
        if (!userStats || !userStats.loginCount) continue;

        // 计算用户等级（所有用户都有等级）
        const userLevel = calculateUserLevel(userStats.loginCount);

        // 为所有用户记录等级信息
        if (userStats.loginCount > 0) {
          const optimizedStats = {
            ...userStats,
            userLevel: {
              level: userLevel.level,
              name: userLevel.name,
              icon: userLevel.icon,
              description: userLevel.description,
              displayTitle: `${userLevel.icon} ${userLevel.name}`
            },
            displayLoginCount: userStats.loginCount > 10000 ? '10000+' :
                              userStats.loginCount > 1000 ? `${Math.floor(userStats.loginCount / 1000)}k+` :
                              userStats.loginCount.toString(),
            lastLevelUpdate: new Date().toISOString()
          };

          // 注意：这里我们只计算等级信息用于日志显示，不保存到数据库
          // 等级信息会在前端动态计算，确保数据一致性
          optimizedCount++;

          console.log(`🎯 用户等级: ${user} -> ${userLevel.icon} ${userLevel.name} (登录${userStats.loginCount}次)`);
        }
      } catch (err) {
        console.error(`❌ 优化用户等级失败 (${user}):`, err);
      }
    }

    console.log(`✅ 等级优化完成，共优化 ${optimizedCount} 个用户`);
  } catch (err) {
    console.error('🚫 等级优化任务失败:', err);
  }
}
