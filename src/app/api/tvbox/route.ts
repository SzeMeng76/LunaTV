import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';

// 生产环境使用Redis/Upstash/Kvrocks的频率限制
async function checkRateLimit(ip: string, limit = 60, windowMs = 60000): Promise<boolean> {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs; // 对齐到时间窗口开始
  const key = `tvbox-rate-limit:${ip}:${windowStart}`;
  
  try {
    // 获取当前计数
    const currentCount = await db.getCache(key) || 0;
    
    if (currentCount >= limit) {
      return false;
    }
    
    // 增加计数并设置过期时间
    const newCount = currentCount + 1;
    const expireSeconds = Math.ceil(windowMs / 1000); // 转换为秒
    await db.setCache(key, newCount, expireSeconds);
    
    return true;
  } catch (error) {
    console.error('Rate limit check failed:', error);
    // 如果数据库操作失败，允许请求通过（fail-open策略）
    return true;
  }
}

// 清理过期的频率限制缓存（内部使用）
async function cleanExpiredRateLimitCache(): Promise<void> {
  try {
    await db.clearExpiredCache('tvbox-rate-limit');
    console.log('Cleaned expired TVBox rate limit cache');
  } catch (error) {
    console.error('Failed to clean expired rate limit cache:', error);
  }
}

// TVBox源格式接口 (基于官方标准)
interface TVBoxSource {
  key: string;
  name: string;
  type: number; // 0=XML接口, 1=JSON接口, 3=Spider/JAR接口
  api: string;
  searchable?: number; // 0=不可搜索, 1=可搜索
  quickSearch?: number; // 0=不支持快速搜索, 1=支持快速搜索
  filterable?: number; // 0=不支持分类筛选, 1=支持分类筛选
  ext?: string; // 扩展数据字段，可包含配置规则或外部文件URL
  jar?: string; // 自定义JAR文件地址
  playerType?: number; // 播放器类型 (0: 系统, 1: ijk, 2: exo, 10: mxplayer, -1: 使用设置页默认)
  playerUrl?: string; // 站点解析URL
  categories?: string[]; // 自定义资源分类和排序
  hide?: number; // 是否隐藏源站 (1: 隐藏, 0: 显示)
}

interface TVBoxConfig {
  spider?: string; // 爬虫jar包地址
  wallpaper?: string; // 壁纸地址
  lives?: Array<{
    name: string;
    type: number;
    url: string;
    epg?: string;
    logo?: string;
  }>; // 直播源
  sites: TVBoxSource[]; // 影视源
  parses?: Array<{
    name: string;
    type: number;
    url: string;
    ext?: Record<string, unknown>;
    header?: Record<string, string>;
  }>; // 解析源
  flags?: string[]; // 播放标识
  ijk?: Record<string, unknown>; // IJK播放器配置
  ads?: string[]; // 广告过滤规则
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json'; // 支持json和base64格式
    const token = searchParams.get('token'); // 获取token参数
    
    // 读取当前配置
    const config = await getConfig();
    const securityConfig = config.TVBoxSecurityConfig;
    
    // Token验证（从数据库配置读取）
    if (securityConfig?.enableAuth) {
      const validToken = securityConfig.token;
      if (!token || token !== validToken) {
        return NextResponse.json({ 
          error: 'Invalid token. Please add ?token=YOUR_TOKEN to the URL',
          hint: '请在URL中添加 ?token=你的密钥 参数'
        }, { status: 401 });
      }
    }
    
    // IP白名单检查（从数据库配置读取）
    if (securityConfig?.enableIpWhitelist && securityConfig.allowedIPs.length > 0) {
      // 获取客户端真实IP - 正确处理x-forwarded-for中的多个IP
      const getClientIP = () => {
        const forwardedFor = request.headers.get('x-forwarded-for');
        if (forwardedFor) {
          // x-forwarded-for可能包含多个IP，第一个通常是客户端真实IP
          return forwardedFor.split(',')[0].trim();
        }
        return request.headers.get('x-real-ip') ||
               request.headers.get('cf-connecting-ip') ||
               'unknown';
      };

      const clientIP = getClientIP();
      
      const isAllowed = securityConfig.allowedIPs.some(allowedIP => {
        const trimmedIP = allowedIP.trim();
        if (trimmedIP === '*') return true;
        
        // 支持CIDR格式检查
        if (trimmedIP.includes('/')) {
          // 简单的CIDR匹配（实际生产环境建议使用专门的库）
          const [network, mask] = trimmedIP.split('/');
          const networkParts = network.split('.').map(Number);
          const clientParts = clientIP.split('.').map(Number);
          const maskBits = parseInt(mask, 10);
          
          // 简化的子网匹配逻辑
          if (maskBits >= 24) {
            const networkPrefix = networkParts.slice(0, 3).join('.');
            const clientPrefix = clientParts.slice(0, 3).join('.');
            return networkPrefix === clientPrefix;
          }
          
          return clientIP.startsWith(network.split('.').slice(0, 2).join('.'));
        }
        
        return clientIP === trimmedIP;
      });
      
      if (!isAllowed) {
        return NextResponse.json({ 
          error: `Access denied for IP: ${clientIP}`,
          hint: '该IP地址不在白名单中'
        }, { status: 403 });
      }
    }
    
    // 访问频率限制（从数据库配置读取）
    if (securityConfig?.enableRateLimit) {
      // 获取客户端真实IP - 正确处理x-forwarded-for中的多个IP
      const getClientIP = () => {
        const forwardedFor = request.headers.get('x-forwarded-for');
        if (forwardedFor) {
          return forwardedFor.split(',')[0].trim();
        }
        return request.headers.get('x-real-ip') ||
               request.headers.get('cf-connecting-ip') ||
               'unknown';
      };

      const clientIP = getClientIP();
      
      const rateLimit = securityConfig.rateLimit || 60;
      
      if (!(await checkRateLimit(clientIP, rateLimit))) {
        return NextResponse.json({ 
          error: 'Rate limit exceeded',
          hint: `访问频率超限，每分钟最多${rateLimit}次请求`
        }, { status: 429 });
      }
    }
    
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const baseUrl = `${protocol}://${host}`;

    // 从配置中获取源站列表
    const sourceConfigs = config.SourceConfig || [];

    if (sourceConfigs.length === 0) {
      return NextResponse.json({ error: '没有配置任何视频源' }, { status: 500 });
    }

    // 过滤掉被禁用的源站和没有API地址的源站
    const enabledSources = sourceConfigs.filter(source => !source.disabled && source.api && source.api.trim() !== '');

    // 转换为TVBox格式
    const tvboxConfig: TVBoxConfig = {
      // 基础配置
      spider: '', // 可以根据需要添加爬虫jar包
      wallpaper: `${baseUrl}/logo.png`, // 使用项目Logo作为壁纸

      // 影视源配置
      sites: await Promise.all(enabledSources.map(async (source) => {
        // 智能的type判断逻辑：
        // 1. 如果api地址包含 "/provide/vod" 且不包含 "at/xml"，则认为是JSON类型 (type=1)
        // 2. 如果api地址包含 "at/xml"，则认为是XML类型 (type=0)
        // 3. 如果api地址以 ".json" 结尾，则认为是JSON类型 (type=1)
        // 4. 其他情况默认为JSON类型 (type=1)，因为现在大部分都是JSON
        let type = 1; // 默认为JSON类型

        if (source.api && typeof source.api === 'string') {
          const apiLower = source.api.toLowerCase();
          if (apiLower.includes('at/xml') || apiLower.endsWith('.xml')) {
            type = 0; // XML类型
          }
        }

        // 动态获取源站分类
        let categories: string[] = ["电影", "电视剧", "综艺", "动漫", "纪录片", "短剧"]; // 默认分类

        try {
          // 尝试获取源站的分类数据
          const categoriesUrl = `${source.api}?ac=list`;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

          const response = await fetch(categoriesUrl, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'TVBox/1.0.0'
            }
          });

          clearTimeout(timeoutId);

          if (response.ok) {
            const data = await response.json();
            if (data.class && Array.isArray(data.class)) {
              categories = data.class.map((cat: any) => cat.type_name || cat.name).filter((name: string) => name);
            }
          }
        } catch (error) {
          // 获取分类失败时使用默认分类
          console.warn(`获取源站 ${source.name} 分类失败，使用默认分类:`, error);
        }

        return {
          key: source.key || source.name,
          name: source.name,
          type: type, // 使用智能判断的type
          api: source.api,
          searchable: 1, // 可搜索
          quickSearch: 1, // 支持快速搜索
          filterable: 1, // 支持分类筛选
          ext: '', // 扩展数据字段，用于配置规则或外部文件URL
          playerUrl: '', // 站点解析URL
          hide: 0, // 是否隐藏源站 (1: 隐藏, 0: 显示)
          categories: categories // 使用动态获取的分类
        };
      })),

      // 解析源配置（添加一些常用的解析源）
      parses: [
        {
          name: "Json并发",
          type: 2,
          url: "Parallel"
        },
        {
          name: "Json轮询",
          type: 2,
          url: "Sequence"
        },
        {
          name: "LunaTV内置解析",
          type: 1,
          url: `${baseUrl}/api/parse?url=`,
          ext: {
            flag: ["qiyi", "qq", "letv", "sohu", "youku", "mgtv", "bilibili", "wasu", "xigua", "1905"]
          }
        }
      ],

      // 播放标识
      flags: [
        "youku", "qq", "iqiyi", "qiyi", "letv", "sohu", "tudou", "pptv",
        "mgtv", "wasu", "bilibili", "le", "duoduozy", "renrenmi", "xigua",
        "优酷", "腾讯", "爱奇艺", "奇艺", "乐视", "搜狐", "土豆", "PPTV",
        "芒果", "华数", "哔哩", "1905"
      ],

      // 直播源（合并所有启用的直播源为一个，解决TVBox多源限制）
      lives: (() => {
        const enabledLives = (config.LiveConfig || []).filter(live => !live.disabled);
        if (enabledLives.length === 0) return [];
        
        // 如果只有一个源，直接返回
        if (enabledLives.length === 1) {
          return enabledLives.map(live => ({
            name: live.name,
            type: 0,
            url: live.url,
            epg: live.epg || "",
            logo: ""
          }));
        }
        
        // 多个源时，创建一个聚合源
        return [{
          name: "LunaTV聚合直播",
          type: 0,
          url: `${baseUrl}/api/live/merged`, // 新的聚合端点
          epg: enabledLives.find(live => live.epg)?.epg || "",
          logo: ""
        }];
      })(),

      // 广告过滤规则
      ads: [
        "mimg.0c1q0l.cn",
        "www.googletagmanager.com",
        "www.google-analytics.com",
        "mc.usihnbcq.cn",
        "mg.g1mm3d.cn",
        "mscs.svaeuzh.cn",
        "cnzz.hhurm.com",
        "tp.vinuxhome.com",
        "cnzz.mmstat.com",
        "www.baihuillq.com",
        "s23.cnzz.com",
        "z3.cnzz.com",
        "c.cnzz.com",
        "stj.v1vo.top",
        "z12.cnzz.com",
        "img.mosflower.cn",
        "tips.gamevvip.com",
        "ehwe.yhdtns.com",
        "xdn.cqqc3.com",
        "www.jixunkyy.cn",
        "sp.chemacid.cn",
        "hm.baidu.com",
        "s9.cnzz.com",
        "z6.cnzz.com",
        "um.cavuc.com",
        "mav.mavuz.com",
        "wofwk.aoidf3.com",
        "z5.cnzz.com",
        "xc.hubeijieshikj.cn",
        "tj.tianwenhu.com",
        "xg.gars57.cn",
        "k.jinxiuzhilv.com",
        "cdn.bootcss.com",
        "ppl.xunzhuo123.com",
        "xomk.jiangjunmh.top",
        "img.xunzhuo123.com",
        "z1.cnzz.com",
        "s13.cnzz.com",
        "xg.huataisangao.cn",
        "z7.cnzz.com",
        "z2.cnzz.com",
        "s96.cnzz.com",
        "q11.cnzz.com",
        "thy.dacedsfa.cn",
        "xg.whsbpw.cn",
        "s19.cnzz.com",
        "z8.cnzz.com",
        "s4.cnzz.com",
        "f5w.as12df.top",
        "ae01.alicdn.com",
        "www.92424.cn",
        "k.wudejia.com",
        "vivovip.mmszxc.top",
        "qiu.xixiqiu.com",
        "cdnjs.hnfenxun.com",
        "cms.qdwght.com"
      ]
    };

    // 根据format参数返回不同格式
    if (format === 'base64' || format === 'txt') {
      // 返回base64编码的配置（TVBox常用格式）
      const configStr = JSON.stringify(tvboxConfig, null, 2);
      const base64Config = Buffer.from(configStr).toString('base64');

      return new NextResponse(base64Config, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });
    } else {
      // 返回JSON格式
      return NextResponse.json(tvboxConfig, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });
    }

  } catch (error) {
    return NextResponse.json(
      { error: 'TVBox配置生成失败', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// 支持CORS预检请求
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}