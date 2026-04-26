/**
 * 节点信息(入口版)
 *
 * 用途:
 * - 查询节点入口 IP 所在地区/ASN 信息
 * - 按自定义格式重命名节点
 * - 可选附加 _entrance 字段, 便于后续脚本继续使用查询结果
 *
 * 当前默认行为:
 * - [internal] 默认开启, 优先使用内部 GeoIP/MMDB 方法查询
 * - [resolve_domain] 默认开启, 在 Node.js 环境下会先用本地 DNS 解析域名再查询
 *
 * ⚠️ 注意
 * - 当 [internal] 开启时, 查询目标最终必须是 IP
 * - 当 [resolve_domain] 开启时, 仅支持 Node.js 环境
 * - 域名解析失败时不会回退原域名, 会按失败节点处理
 * - 脚本不会修改原始 proxy.server, 解析得到的 IP 仅用于查询和缓存
 *
 * 查看说明: https://t.me/zhetengsha/1358
 *
 * 落地版脚本请查看: https://t.me/zhetengsha/1269
 *
 * 欢迎加入 Telegram 群组 https://t.me/zhetengsha
 *
 * 参数
 * - [retries] 重试次数 默认 1
 * - [retry_delay] 重试延时(单位: 毫秒) 默认 1000
 * - [concurrency] 并发数 默认 10
 * - [internal] 使用内部方法获取 IP 信息. 默认 true
 *              支持以下几种运行环境:
 *              1. Surge/Loon(build >= 692) 等有 $utils.ipaso 和 $utils.geoip API 的 App
 *              2. Node.js 版 Sub-Store, 设置环境变量 SUB_STORE_MMDB_COUNTRY_PATH 和 SUB_STORE_MMDB_ASN_PATH, 或 传入 mmdb_country_path 和 mmdb_asn_path 参数(分别为 MaxMind GeoLite2 Country 和 GeoLite2 ASN 数据库 的路径)
 *              数据来自 GeoIP 数据库
 *              ⚠️ 若节点服务器为域名, 请配合 resolve_domain 使用
 * - [method] 请求方法. 默认 get
 * - [timeout] 请求超时(单位: 毫秒) 默认 5000
 * - [api] 测入口的 API . 默认为 http://ip-api.com/json/{{proxy.server}}?lang=zh-CN
 * - [format] 自定义格式, 从 节点(proxy) 和 入口(api)中取数据. 默认为: {{api.country}} {{api.isp}} - {{proxy.name}}
 *            当使用 internal 时, 默认为 {{api.countryCode}} {{api.aso}} - {{proxy.name}}
 *            当 api.country 或 api.countryCode 为空时, 格式化输出会自动使用 ?? 作为占位符
 * - [regex] 使用正则表达式从落地 API 响应(api)中取数据. 格式为 a:x;b:y 此时将使用正则表达式 x 和 y 来从 api 中取数据, 赋值给 a 和 b. 然后可在 format 中使用 {{api.a}} 和 {{api.b}}
 * - [valid] 验证 api 请求是否合法. 默认: ProxyUtils.isIP('{{api.ip || api.query}}')
 *           当使用 internal 时, 默认为 "{{api.countryCode || api.aso}}".length > 0
 * - [uniq_key] 设置缓存唯一键名包含的节点数据字段名匹配正则. 默认为 ^server$ 即服务器地址相同的节点共享缓存
 * - [entrance] 在节点上附加 _entrance 字段(API 响应数据), 默认不附加
 * - [remove_failed] 移除失败的节点. 默认不移除.
 * - [mmdb_country_path] 见 internal
 * - [mmdb_asn_path] 见 internal
 * - [resolve_domain] 使用本地 DNS 解析节点域名后再查询. 默认 true
 *                    仅支持 Node.js 环境, 优先使用 IPv4, 若无 IPv4 则回退到系统返回的首个可用地址
 *                    解析失败时按失败节点处理, 不回退原域名
 * - [cache] 使用缓存, 默认使用缓存
 * - [disable_failed_cache/ignore_failed_error] 禁用失败缓存. 即不缓存失败结果
 *
 * 示例
 * - 内部查询 + 本地 DNS 解析:
 *   SubStoreEntrance.js#internal=true&resolve_domain=true&cache=true
 * - 关闭本地 DNS 解析, 直接使用节点 server 查询:
 *   SubStoreEntrance.js#resolve_domain=false
 * - 使用 HTTP API 查询入口地区:
 *   SubStoreEntrance.js#internal=false&api=http://ip-api.com/json/{{proxy.server}}?lang=zh-CN
 *
 * 关于缓存时长
 * 当使用相关脚本时, 若在对应的脚本中使用参数(⚠ 别忘了这个, 一般为 cache, 值设为 true 即可)开启缓存
 * 可在前端(>=2.16.0) 配置各项缓存的默认时长
 * 持久化缓存数据在 JSON 里
 * 可以在脚本的前面添加一个脚本操作, 实现保留 1 小时的缓存. 这样比较灵活
 * async function operator() {
 *     scriptResourceCache._cleanup(undefined, 1 * 3600 * 1000);
 * }
 */

async function operator(proxies = [], targetPlatform, context) {
  const $ = $substore;
  const { isNode } = $.env;
  const internal = /true|1/.test($arguments.internal ?? 1);
  const mmdb_country_path = $arguments.mmdb_country_path;
  const mmdb_asn_path = $arguments.mmdb_asn_path;
  const resolveDomain = /true|1/.test($arguments.resolve_domain ?? 1);
  const regex = $arguments.regex;
  let valid = $arguments.valid || `ProxyUtils.isIP('{{api.ip || api.query}}')`;
  let format =
    $arguments.format || `{{api.country}} {{api.isp}} - {{proxy.name}}`;
  let utils;
  let dns;
  if (resolveDomain) {
    if (!isNode) {
      throw new Error("resolve_domain 仅支持 Node.js 环境");
    }
    dns = require("dns").promises;
  }
  if (internal) {
    if (isNode) {
      utils = new ProxyUtils.MMDB({
        country: mmdb_country_path,
        asn: mmdb_asn_path,
      });
      $.info(
        `[MMDB] GeoLite2 Country 数据库文件路径: ${mmdb_country_path || eval("process.env.SUB_STORE_MMDB_COUNTRY_PATH")}`,
      );
      $.info(
        `[MMDB] GeoLite2 ASN 数据库文件路径: ${mmdb_asn_path || eval("process.env.SUB_STORE_MMDB_ASN_PATH")}`,
      );
    } else {
      // if (isSurge) {
      //   //
      // } else if (isLoon) {
      //   const build = $loon.match(/\((\d+)\)$/)?.[1]
      //   if (build < 692) throw new Error('Loon 版本过低, 请升级到 build 692 及以上版本')
      // } else {
      //   throw new Error('仅 Surge/Loon 支持使用内部方法获取 IP 信息')
      // }
      if (
        typeof $utils === "undefined" ||
        typeof $utils.geoip === "undefined" ||
        typeof $utils.ipaso === "undefined"
      ) {
        $.error(
          `目前仅支持 Surge/Loon(build >= 692) 等有 $utils.ipaso 和 $utils.geoip API 的 App`,
        );
        throw new Error("不支持使用内部方法获取 IP 信息, 请查看日志");
      }
      utils = $utils;
    }
    format =
      $arguments.format || `{{api.countryCode}} {{api.aso}} - {{proxy.name}}`;
    valid = $arguments.valid || `"{{api.countryCode || api.aso}}".length > 0`;
  }
  const disableFailedCache =
    $arguments.disable_failed_cache || $arguments.ignore_failed_error;
  const remove_failed = $arguments.remove_failed;
  const entranceEnabled = $arguments.entrance;
  const cacheEnabled = /true|1/.test($arguments.cache ?? 1);
  const uniq_key = $arguments.uniq_key || "^server$";
  const cache = scriptResourceCache;
  const method = $arguments.method || "get";
  const url =
    $arguments.api || `http://ip-api.com/json/{{proxy.server}}?lang=zh-CN`;
  const concurrency = parseInt($arguments.concurrency || 10); // 一组并发数
  const shouldLogResolveDns =
    resolveDomain &&
    proxies.some((proxy) => {
      const server = String(proxy?.server || "").trim();
      return server && !ProxyUtils.isIP(server);
    });
  if (shouldLogResolveDns) {
    $.info("Resolve DNS locally");
  }
  await executeAsyncTasks(
    proxies.map((proxy) => () => check(proxy)),
    { concurrency },
  );
  if (shouldLogResolveDns) {
    $.info("Resolve DNS locally completed");
  }

  // const batches = []
  // for (let i = 0; i < proxies.length; i += concurrency) {
  //   const batch = proxies.slice(i, i + concurrency)
  //   batches.push(batch)
  // }
  // for (const batch of batches) {
  //   await Promise.all(batch.map(check))
  // }

  if (remove_failed) {
    proxies = proxies.filter((p) => {
      if (remove_failed && !p._entrance) {
        return false;
      }
      return true;
    });
  }

  if (!entranceEnabled) {
    proxies = proxies.map((p) => {
      if (!entranceEnabled) {
        delete p._entrance;
      }
      return p;
    });
  }

  return proxies;

  async function check(proxy) {
    // $.info(`[${proxy.name}] 检测`)
    // $.info(`检测 ${JSON.stringify(proxy, null, 2)}`)
    let queryServer = String(proxy.server || "").trim();
    let id = cacheEnabled ? getCacheId(proxy, queryServer) : undefined;
    // $.info(`检测 ${id}`)
    try {
      queryServer = await getQueryServer(proxy);
      id = cacheEnabled ? getCacheId(proxy, queryServer) : undefined;
      const cached = cache.get(id);
      if (cacheEnabled && cached) {
        if (cached.api) {
          // $.info(`[${proxy.name}] 使用成功结果缓存`);
          $.log(`[${proxy.name}] api: ${JSON.stringify(cached.api, null, 2)}`);
          proxy.name = formatter({ proxy, api: cached.api, format, regex });
          proxy._entrance = cached.api;
          return;
        } else {
          if (disableFailedCache) {
            $.info(`[${proxy.name}] 跳过失败结果缓存`);
          } else {
            $.info(`[${proxy.name}] 使用失败结果缓存`);
            return;
          }
        }
      }
      // 请求
      const startedAt = Date.now();
      let api = {};
      if (internal) {
        api = {
          countryCode: utils.geoip(queryServer) || "",
          aso: utils.ipaso(queryServer) || "",
        };
        $.info(
          `[${proxy.name}] queryServer: ${queryServer}, countryCode: ${api.countryCode}, aso: ${api.aso}`,
        );
        if (
          (api.countryCode || api.aso) &&
          eval(formatter({ api, format: valid, regex }))
        ) {
          proxy.name = formatter({ proxy, api, format, regex });
          proxy._entrance = api;
          if (cacheEnabled) {
            $.info(`[${proxy.name}] 写入成功结果缓存`);
            cache.set(id, { api });
          }
        } else {
          if (cacheEnabled) {
            $.info(`[${proxy.name}] 写入失败结果缓存`);
            cache.set(id, {});
          }
        }
      } else {
        const res = await http({
          method,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1",
          },
          url: formatter({
            proxy: { ...proxy, server: queryServer },
            format: url,
          }),
        });
        api = String(lodash_get(res, "body"));
        try {
          api = JSON.parse(api);
        } catch (e) {}
        const status = parseInt(res.status || res.statusCode || 200);
        let latency = "";
        latency = `${Date.now() - startedAt}`;
        $.info(
          `[${proxy.name}] queryServer: ${queryServer}, status: ${status}, latency: ${latency}`,
        );
        if (status == 200 && eval(formatter({ api, format: valid, regex }))) {
          proxy.name = formatter({ proxy, api, format, regex });
          proxy._entrance = api;
          if (cacheEnabled) {
            $.info(`[${proxy.name}] 写入成功结果缓存`);
            cache.set(id, { api });
          }
        } else {
          if (cacheEnabled) {
            $.info(`[${proxy.name}] 写入失败结果缓存`);
            cache.set(id, {});
          }
        }
      }
      $.log(`[${proxy.name}] api: ${JSON.stringify(api, null, 2)}`);
    } catch (e) {
      $.error(`[${proxy.name}] ${e.message ?? e}`);
      if (cacheEnabled) {
        $.info(`[${proxy.name}] 写入失败结果缓存`);
        cache.set(id, {});
      }
    }
  }
  // 请求
  async function http(opt = {}) {
    const METHOD = opt.method || "get";
    const TIMEOUT = parseFloat(opt.timeout || $arguments.timeout || 5000);
    const RETRIES = parseFloat(opt.retries ?? $arguments.retries ?? 1);
    const RETRY_DELAY = parseFloat(
      opt.retry_delay ?? $arguments.retry_delay ?? 1000,
    );

    let count = 0;
    const fn = async () => {
      try {
        return await $.http[METHOD]({ ...opt, timeout: TIMEOUT });
      } catch (e) {
        // $.error(e)
        if (count < RETRIES) {
          count++;
          const delay = RETRY_DELAY * count;
          // $.info(`第 ${count} 次请求失败: ${e.message || e}, 等待 ${delay / 1000}s 后重试`)
          await $.wait(delay);
          return await fn();
        } else {
          throw e;
        }
      }
    };
    return await fn();
  }
  function getCacheId(proxy, queryServer) {
    return `entrance:${url}:${format}:${regex}:${internal}:${resolveDomain}:${queryServer}:${JSON.stringify(
      Object.fromEntries(
        Object.entries(proxy).filter(([key]) => {
          const re = new RegExp(uniq_key);
          return re.test(key);
        }),
      ),
    )}`;
  }
  async function getQueryServer(proxy) {
    const server = String(proxy.server || "").trim();
    if (!resolveDomain || !server || ProxyUtils.isIP(server)) {
      return server;
    }
    const resolved = await resolveServer(server);
    $.info(`${proxy.name} - ${server} -> ${resolved}`);
    return resolved;
  }
  async function resolveServer(server) {
    try {
      const records = await dns.lookup(server, { all: true, verbatim: true });
      const addresses = Array.isArray(records) ? records : [records];
      const ipv4 = addresses.find((item) => item?.family === 4)?.address;
      const fallback = addresses.find((item) => item?.address)?.address;
      const resolved = ipv4 || fallback;
      if (!resolved) {
        throw new Error("未返回可用 IP");
      }
      return resolved;
    } catch (e) {
      throw new Error(`本地 DNS 解析失败: ${server} (${e.message ?? e})`);
    }
  }
  function lodash_get(source, path, defaultValue = undefined) {
    const paths = path.replace(/\[(\d+)\]/g, ".$1").split(".");
    let result = source;
    for (const p of paths) {
      result = Object(result)[p];
      if (result === undefined) {
        return defaultValue;
      }
    }
    return result;
  }
  function formatter({ proxy = {}, api = {}, format = "", regex = "" }) {
    if (regex) {
      const regexPairs = regex.split(/\s*;\s*/g).filter(Boolean);
      const extracted = {};
      for (const pair of regexPairs) {
        const [key, pattern] = pair.split(/\s*:\s*/g).map((s) => s.trim());
        if (key && pattern) {
          try {
            const reg = new RegExp(pattern);
            extracted[key] = (
              typeof api === "string" ? api : JSON.stringify(api)
            )
              .match(reg)?.[1]
              ?.trim();
          } catch (e) {
            $.error(`正则表达式解析错误: ${e.message}`);
          }
        }
      }
      api = { ...api, ...extracted };
    }

    api = normalizeCountryPlaceholders(api);

    let f = format.replace(/\{\{(.*?)\}\}/g, "${$1}");
    return eval(`\`${f}\``);
  }
  function normalizeCountryPlaceholders(api) {
    if (!api || typeof api !== "object" || Array.isArray(api)) {
      return api;
    }

    const normalized = { ...api };
    for (const key of ["countryCode", "country"]) {
      if (
        normalized[key] === undefined ||
        normalized[key] === null ||
        String(normalized[key]).trim() === ""
      ) {
        normalized[key] = "??";
      }
    }
    return normalized;
  }
  function executeAsyncTasks(tasks, { wrap, result, concurrency = 1 } = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        let running = 0;
        const results = [];

        let index = 0;

        function executeNextTask() {
          while (index < tasks.length && running < concurrency) {
            const taskIndex = index++;
            const currentTask = tasks[taskIndex];
            running++;

            currentTask()
              .then((data) => {
                if (result) {
                  results[taskIndex] = wrap ? { data } : data;
                }
              })
              .catch((error) => {
                if (result) {
                  results[taskIndex] = wrap ? { error } : error;
                }
              })
              .finally(() => {
                running--;
                executeNextTask();
              });
          }

          if (running === 0) {
            return resolve(result ? results : undefined);
          }
        }

        await executeNextTask();
      } catch (e) {
        reject(e);
      }
    });
  }
}
