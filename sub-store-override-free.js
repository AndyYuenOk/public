/**
 *
 * 节点可用性检测(适配 Sub-Store Node.js 版)
 *
 * 说明: https://t.me/zhetengsha/1210
 *
 * 欢迎加入 Telegram 群组 https://t.me/zhetengsha
 *
 * HTTP META(https://github.com/xream/http-meta) 参数
 * - [http_meta_protocol] 协议 默认: http
 * - [http_meta_host] 服务地址 默认: 127.0.0.1
 * - [http_meta_port] 端口号 默认: 9876
 * - [http_meta_authorization] Authorization 默认无
 * - [http_meta_start_delay] 初始启动延时(单位: 毫秒) 默认: 1000
 * - [http_meta_proxy_timeout] 每个节点耗时(单位: 毫秒) 默认: 5000
 *
 * 其它参数
 * - [take] 目标可用节点数(同时作为每批检测数). 默认 10
 * - [timeout] 请求超时(单位: 毫秒) 默认 5000
 * - [retries] 重试次数 默认 1
 * - [retry_delay] 重试延时(单位: 毫秒) 默认 1000
 * - [url] 检测 URL. 需要 encodeURIComponent
 * - [ua] 请求头 User-Agent. 需要 encodeURIComponent
 * - [status] 合法状态码正则. 需要 encodeURIComponent. 默认 204
 * - [method] 请求方法. 默认 head
 * - [show_latency] 显示延迟
 * - [cache] 使用缓存(默认开启)
 * - [disable_failed_cache/ignore_failed_error] 禁用失败缓存(命中失败缓存时重测)
 *
 * 缓存说明
 * - 缓存固定 TTL 为 5 分钟(300000ms)
 * - 成功缓存: { latency, ts }
 * - 失败缓存: { ts }
 */

let config = ProxyUtils.yaml.load($content ?? $files[0]);
await _main(config.proxies);
$content = ProxyUtils.yaml.dump(config);

async function _main(proxies) {
  proxies.sort(
    (a, b) =>
      parseFloat(String(b.name).split("|")[1]) -
      parseFloat(String(a.name).split("|")[1]),
  );

  const $ = $substore;
  const cacheEnabled = /true|1/.test($arguments.cache ?? 0);
  const disableFailedCache =
    $arguments.disable_failed_cache || $arguments.ignore_failed_error;
  const cache = scriptResourceCache;
  const cacheTTL = 5 * 60 * 1000;
  const now = () => Date.now();

  const take = Math.max(1, parseInt($arguments.take ?? 10, 10) || 10);

  const http_meta_host = $arguments.http_meta_host ?? "127.0.0.1";
  const http_meta_port = $arguments.http_meta_port ?? 9876;
  const http_meta_protocol = $arguments.http_meta_protocol ?? "http";
  const http_meta_authorization = $arguments.http_meta_authorization ?? "";
  const http_meta_api = `${http_meta_protocol}://${http_meta_host}:${http_meta_port}`;
  const http_meta_start_delay = parseFloat(
    $arguments.http_meta_start_delay ?? 1000,
  );
  const http_meta_proxy_timeout = parseFloat(
    $arguments.http_meta_proxy_timeout ?? 5000,
  );

  const concurrency = take;
  const method = $arguments.method || "head";
  const validStatusRaw = String($arguments.status || "204");
  const validStatus = new RegExp(validStatusRaw);
  const url = decodeURIComponent(
    $arguments.url || "http://www.gstatic.com/generate_204",
  );
  const ua = decodeURIComponent(
    $arguments.ua ||
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1",
  );

  const validProxies = [];
  const internalProxies = [];

  proxies.forEach((proxy, index) => {
    try {
      const node = ProxyUtils.produce(
        [{ ...proxy }],
        "ClashMeta",
        "internal",
      )?.[0];
      if (!node) return;

      for (const key in proxy) {
        if (/^_/i.test(key)) {
          node[key] = proxy[key];
        }
      }
      internalProxies.push({
        ...node,
        _sorted_index: index,
      });
    } catch (e) {
      $.error(e);
    }
  });

  $.info(`核心支持节点数: ${internalProxies.length}/${proxies.length}`);
  if (!internalProxies.length) return [];

  for (
    let cursor = 0;
    cursor < internalProxies.length && validProxies.length < take;
    cursor += take
  ) {
    const batch = internalProxies.slice(cursor, cursor + take);
    await processBatch(batch);
  }

  return validProxies.slice(0, take);

  async function processBatch(batch = []) {
    if (!batch.length || validProxies.length >= take) return;

    const batchSuccessMap = new Map();
    const proxiesToCheck = [];

    for (const proxy of batch) {
      const cacheResult = getCacheResult(proxy);
      if (cacheResult.type === "success") {
        batchSuccessMap.set(proxy._sorted_index, cacheResult.latency);
      } else {
        proxiesToCheck.push(proxy);
      }
    }

    if (proxiesToCheck.length) {
      const http_meta_timeout =
        http_meta_start_delay + proxiesToCheck.length * http_meta_proxy_timeout;
      let http_meta_pid;
      let http_meta_ports = [];

      try {
        const startRes = await http({
          retries: 0,
          method: "post",
          url: `${http_meta_api}/start`,
          headers: {
            "Content-type": "application/json",
            Authorization: http_meta_authorization,
          },
          body: JSON.stringify({
            proxies: proxiesToCheck,
            timeout: http_meta_timeout,
          }),
        });

        let body = startRes.body;
        try {
          body = JSON.parse(body);
        } catch (e) {}

        const { ports, pid } = body;
        if (!pid || !ports) {
          throw new Error(`======== HTTP META 启动失败 ====\n${body}`);
        }

        http_meta_pid = pid;
        http_meta_ports = ports;
        $.info(
          `\n======== HTTP META 启动 ====\n[端口] ${ports}\n[PID] ${pid}\n[超时] 若未手动关闭 ${
            Math.round(http_meta_timeout / 60 / 10) / 100
          } 分钟后自动关闭\n`,
        );
        $.info(`等待 ${http_meta_start_delay / 1000} 秒后开始检测`);
        await $.wait(http_meta_start_delay);

        const checked = await executeAsyncTasks(
          proxiesToCheck.map((proxy, index) => async () => {
            return await checkWithHttpMeta(proxy, http_meta_ports[index]);
          }),
          { concurrency, result: true, wrap: true },
        );

        for (const item of checked || []) {
          if (item?.data?.ok) {
            batchSuccessMap.set(item.data.sortedIndex, item.data.latency);
          }
        }
      } finally {
        if (http_meta_pid) {
          try {
            const stopRes = await http({
              method: "post",
              url: `${http_meta_api}/stop`,
              headers: {
                "Content-type": "application/json",
                Authorization: http_meta_authorization,
              },
              body: JSON.stringify({
                pid: [http_meta_pid],
              }),
            });
            $.info(
              `\n======== HTTP META 关闭 ====\n${JSON.stringify(stopRes, null, 2)}`,
            );
          } catch (e) {
            $.error(e);
          }
        }
      }
    }

    flushBatchSuccess(batch, batchSuccessMap);
  }

  function flushBatchSuccess(batch, successMap) {
    for (const proxy of batch) {
      if (validProxies.length >= take) {
        return;
      }
      const latency = successMap.get(proxy._sorted_index);
      if (latency === undefined) continue;
      validProxies.push(toProxyOutput(proxy, latency));
    }
  }

  function getCacheResult(proxy) {
    const id = getCacheId(proxy);
    if (!cacheEnabled) return { type: "miss", id };

    const cached = cache.get(id);
    if (!cached) return { type: "miss", id };

    const ts = Number(cached.ts ?? 0);
    if (!ts || now() - ts > cacheTTL) {
      return { type: "miss", id };
    }

    if (cached.latency !== undefined && cached.latency !== null) {
      $.info(`[${proxy.name}] 使用成功缓存`);
      return {
        type: "success",
        id,
        latency: cached.latency,
      };
    }

    if (disableFailedCache) {
      $.info(`[${proxy.name}] 跳过失败缓存并重测`);
      return { type: "miss", id };
    }

    $.info(`[${proxy.name}] 使用失败缓存`);
    return { type: "failed", id };
  }

  async function checkWithHttpMeta(proxy, port) {
    const id = getCacheId(proxy);
    try {
      const startedAt = now();
      const res = await http({
        proxy: `http://${http_meta_host}:${port}`,
        method,
        headers: {
          "User-Agent": ua,
        },
        url,
      });
      const status = parseInt(res.status || res.statusCode || 200, 10);
      const latency = now() - startedAt;
      $.info(`[${proxy.name}] status: ${status}, latency: ${latency}`);

      if (validStatus.test(status)) {
        if (cacheEnabled) {
          cache.set(id, { latency, ts: now() });
        }
        return {
          ok: true,
          sortedIndex: proxy._sorted_index,
          latency,
        };
      }

      if (cacheEnabled) {
        cache.set(id, { ts: now() });
      }
      return {
        ok: false,
      };
    } catch (e) {
      $.error(`[${proxy.name}] ${e.message ?? e}`);
      if (cacheEnabled) {
        cache.set(id, { ts: now() });
      }
      return {
        ok: false,
      };
    }
  }

  function toProxyOutput(proxy, latency) {
    return {
      ...ProxyUtils.parse(JSON.stringify(proxy))[0],
      name: `${$arguments.show_latency ? `[${latency}] ` : ""}${proxy.name}`,
      _latency: `${latency}`,
    };
  }

  function getCacheId(proxy) {
    return `http-meta:availability:v2:${url}:${method}:${validStatusRaw}:${JSON.stringify(
      Object.fromEntries(
        Object.entries(proxy).filter(
          ([key]) => !/^(name|collectionName|subName|id|_.*)$/i.test(key),
        ),
      ),
    )}`;
  }

  async function http(opt = {}) {
    const METHOD = opt.method || $arguments.method || "get";
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
        if (count < RETRIES) {
          count++;
          const delay = RETRY_DELAY * count;
          await $.wait(delay);
          return await fn();
        }
        throw e;
      }
    };

    return await fn();
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
