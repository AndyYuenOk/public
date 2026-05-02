/**
 * Egress info for Sub-Store Node.js
 * - Align cache behavior with entrance script
 * - Mount only egress* field set + optional _egress payload
 */

async function operator(proxies = [], targetPlatform, context) {
  const $ = $substore;
  const info = (msg = "") => console.log(`[egress] ${msg}`);
  const error = (msg = "") => console.log(`[egress] ${msg}`);
  const logBoundary = (phase = "") =>
    info(
      `==================== [SUB-STORE-EGRESS ${phase}] ====================`,
    );
  const logHttpMetaBoundary = (phase = "") =>
    info(`==================== [HTTP META ${phase}] ====================`);
  logBoundary("START");

  // Always cache for the client.
  let useCache = 1;
  if (targetPlatform === "JSON") {
    useCache = /true|1/i.test($arguments.cache ?? 0);
  }
  // Read/write decoupled: JSON + cache=false still writes latest result.
  const shouldWriteCache = true;

  const cache = scriptResourceCache;
  const disableFailedCache =
    $arguments.disable_failed_cache || $arguments.ignore_failed_error;
  const remove_failed = $arguments.remove_failed;
  const remove_incompatible = $arguments.remove_incompatible;
  const incompatibleEnabled = $arguments.incompatible;
  const egressEnabled = $arguments.egress;

  const http_meta_host = $arguments.http_meta_host ?? "127.0.0.1";
  const http_meta_port = $arguments.http_meta_port ?? 9876;
  const http_meta_protocol = $arguments.http_meta_protocol ?? "http";
  const http_meta_authorization = $arguments.http_meta_authorization ?? "";
  const http_meta_api = `${http_meta_protocol}://${http_meta_host}:${http_meta_port}`;
  const http_meta_start_delay = parseFloat(
    $arguments.http_meta_start_delay ?? 100,
  );
  const http_meta_proxy_timeout = parseFloat(
    $arguments.http_meta_proxy_timeout ?? 10000,
  );

  const internal = /true|1/.test($arguments.internal ?? 0);
  const mmdb_country_path = $arguments.mmdb_country_path;
  const mmdb_asn_path = $arguments.mmdb_asn_path;
  const regex = $arguments.regex;
  const uniq_key = $arguments.uniq_key || "^server$|^port$";

  let valid = $arguments.valid || `ProxyUtils.isIP('{{api.ip || api.query}}')`;
  const shouldRename = Boolean($arguments.format);
  let format = $arguments.format || "";
  let url = $arguments.api || "http://ip-api.com/json/{{proxy.server}}?lang=en";
  const method = $arguments.method || "get";

  let utils;
  if (internal) {
    utils = new ProxyUtils.MMDB({
      country: mmdb_country_path,
      asn: mmdb_asn_path,
    });
    info(
      `[MMDB] GeoLite2 Country database path: ${mmdb_country_path || eval("process.env.SUB_STORE_MMDB_COUNTRY_PATH")}`,
    );
    info(
      `[MMDB] GeoLite2 ASN database path: ${mmdb_asn_path || eval("process.env.SUB_STORE_MMDB_ASN_PATH")}`,
    );
    format = $arguments.format || "";
    valid = $arguments.valid || `"{{api.countryCode || api.aso}}".length > 0`;
    url = $arguments.api || "http://checkip.amazonaws.com";
  }

  const isIpApiUrl = /^https?:\/\/ip-api\.com\/json\//i.test(url);
  const ipApiRawCacheReadEnabled = useCache && isIpApiUrl;
  const ipApiRawCacheWriteEnabled = shouldWriteCache && isIpApiUrl;
  const ipApiInFlight = new Map();
  const ipApiRequestCache = new Map();
  const nodeCount = proxies.length;
  let ipApiRequestCount = 0;
  const egressGroupMap = new Map();
  let egressGroupSeq = 0;

  const internalProxies = [];
  proxies.map((proxy, index) => {
    try {
      const node = ProxyUtils.produce(
        [{ ...proxy }],
        "ClashMeta",
        "internal",
      )?.[0];
      if (node) {
        for (const key in proxy) {
          if (/^_/i.test(key)) {
            node[key] = proxy[key];
          }
        }
        node._origin_server = proxy.server;
        node._origin_port = proxy.port;
        internalProxies.push({ ...node, _proxies_index: index });
      } else {
        proxies[index]._incompatible = true;
      }
    } catch (e) {
      error(e);
    }
  });

  info(`Core supported nodes: ${internalProxies.length}/${proxies.length}`);
  if (!internalProxies.length) {
    logBoundary("END");
    return proxies;
  }

  const http_meta_timeout =
    http_meta_start_delay + internalProxies.length * http_meta_proxy_timeout;

  let http_meta_pid;
  let http_meta_ports = [];

  const startRes = await http({
    retries: 0,
    method: "post",
    url: `${http_meta_api}/start`,
    headers: {
      "Content-type": "application/json",
      Authorization: http_meta_authorization,
    },
    body: JSON.stringify({
      proxies: internalProxies,
      timeout: http_meta_timeout,
    }),
  });

  let startBody = startRes.body;
  try {
    startBody = JSON.parse(startBody);
  } catch (e) {}

  const { ports, pid } = startBody;
  if (!pid || !ports) {
    logBoundary("END");
    throw new Error(`HTTP META start failed: ${startBody}`);
  }

  http_meta_pid = pid;
  http_meta_ports = ports;
  logHttpMetaBoundary("START");
  info(
    `HTTP META started: ports=${Array.isArray(ports) ? ports.length : 0}, PID=${pid}, timeout=${Math.round(http_meta_timeout / 60 / 10) / 100} minutes`,
  );
  info(`Wait ${http_meta_start_delay / 1000} seconds before checks`);
  await $.wait(http_meta_start_delay);

  const concurrency = parseInt($arguments.concurrency || 10, 10) || 10;
  await executeAsyncTasks(
    internalProxies.map((proxy) => () => check(proxy)),
    { concurrency },
  );

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
    const stopStatus = String(stopRes?.status ?? stopRes?.statusCode ?? "");
    const stopBody = String(stopRes?.body ?? "");
    info(`HTTP META stop response: status=${stopStatus}, body=${stopBody}`);
  } catch (e) {
    error(e);
  } finally {
    logHttpMetaBoundary("END");
  }

  if (remove_incompatible || remove_failed) {
    proxies = proxies.filter((p) => {
      if (remove_incompatible && p._incompatible) {
        return false;
      }
      if (remove_failed && !p._egress) {
        return !remove_incompatible && p._incompatible;
      }
      return true;
    });
  }

  if (!egressEnabled || !incompatibleEnabled) {
    proxies = proxies.map((p) => {
      if (!egressEnabled) {
        delete p._egress;
      }
      if (!incompatibleEnabled) {
        delete p._incompatible;
      }
      return p;
    });
  }

  info(
    `[stats] nodes: ${nodeCount}, ip-api requests: ${ipApiRequestCount}, groups: ${egressGroupMap.size}`,
  );
  logBoundary("END");
  return proxies;

  async function check(proxy) {
    const index = internalProxies.indexOf(proxy);
    if (index < 0) return;

    const serverWithPort = getServerWithPort(proxy);
    const queryServer = String(proxy.server || "").trim();
    const id = shouldWriteCache ? getCacheId(proxy, queryServer) : undefined;

    try {
      const cached = useCache ? cache.get(id) : null;
      if (useCache && cached) {
        if (cached.api) {
          const cachedGroupCode = getOrCreateGroupCode(
            getReturnedIp(cached.api),
          );
          const cacheInfo = internal
            ? formatCountryAsoAsInfo(cached.api)
            : formatIpApiInfo(cached.api);
          info(
            `USE CACHE, [${proxy.name}] ${cachedGroupCode ? `${cachedGroupCode}, ` : ""}${formatServerWithIp(serverWithPort, cached.api)}, ${cacheInfo}`,
          );
          applyEgressInfo(proxies[proxy._proxies_index], cached.api);
          applyEgressGroup(proxies[proxy._proxies_index], cached.api);
          if (shouldRename) {
            proxies[proxy._proxies_index].name = formatter({
              proxy: proxies[proxy._proxies_index],
              api: cached.api,
              format,
              regex,
            });
          }
          proxies[proxy._proxies_index]._egress = cached.api;
          return;
        }
        if (disableFailedCache) {
          info(`[${proxy.name}] skip failed cache`);
        } else {
          info(`USE CACHE, [${proxy.name}] error`);
          return;
        }
      }

      const startedAt = Date.now();
      let api = {};

      if (internal) {
        const res = await http({
          proxy: `http://${http_meta_host}:${http_meta_ports[index]}`,
          method,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1",
          },
          url,
        });

        const status = parseInt(res.status || res.statusCode || 200, 10);
        const ip = String(lodash_get(res, "body", "")).trim();
        api = {
          countryCode: utils.geoip(ip) || "",
          aso: utils.ipaso(ip) || "",
          query: ip,
        };

        if (
          (api.countryCode || api.aso) &&
          eval(formatter({ api, format: valid, regex }))
        ) {
          const groupCode = getOrCreateGroupCode(getReturnedIp(api));
          applyEgressInfo(proxies[proxy._proxies_index], api);
          applyEgressGroup(proxies[proxy._proxies_index], api);
          if (shouldRename) {
            proxies[proxy._proxies_index].name = formatter({
              proxy: proxies[proxy._proxies_index],
              api,
              format,
              regex,
            });
          }
          proxies[proxy._proxies_index]._egress = api;
          info(
            `[${proxy.name}] ${groupCode ? `${groupCode}, ` : ""}${formatServerWithIp(serverWithPort, api)}, ${formatCountryAsoAsInfo(api)}`,
          );
          if (shouldWriteCache) {
            cache.set(id, { api });
          }
        } else if (shouldWriteCache) {
          cache.set(id, {});
        }
      } else {
        const ipApiResult = await getIpApiResult(
          proxy,
          queryServer,
          startedAt,
          index,
        );
        api = ipApiResult.api;
        const status = ipApiResult.status;

        const validApi = eval(formatter({ api, format: valid, regex }));
        if (status === 200 && validApi) {
          const groupCode = getOrCreateGroupCode(getReturnedIp(api));
          applyEgressInfo(proxies[proxy._proxies_index], api);
          applyEgressGroup(proxies[proxy._proxies_index], api);
          if (shouldRename) {
            proxies[proxy._proxies_index].name = formatter({
              proxy: proxies[proxy._proxies_index],
              api,
              format,
              regex,
            });
          }
          proxies[proxy._proxies_index]._egress = api;
          if (ipApiResult.source === "persistent-cache") {
            info(
              `[${proxy.name}] ${groupCode ? `${groupCode}, ` : ""}${formatServerWithIp(serverWithPort, api)}, using IP API persistent cache, ${formatIpApiInfo(api)}`,
            );
          } else if (
            ipApiResult.source === "shared-cache" ||
            ipApiResult.source === "shared-inflight"
          ) {
            info(
              `[${proxy.name}] ${groupCode ? `${groupCode}, ` : ""}${formatServerWithIp(serverWithPort, api)}, deduplicated, ${formatIpApiInfo(api)}`,
            );
          } else {
            info(
              `[${proxy.name}] ${groupCode ? `${groupCode}, ` : ""}${formatServerWithIp(serverWithPort, api)}, ${formatIpApiInfo(api)}, status: ${status}`,
            );
          }
          if (ipApiRawCacheWriteEnabled && ipApiResult.source === "network") {
            cache.set(getIpApiCacheId(queryServer), api);
          }
          if (shouldWriteCache) {
            cache.set(id, { api });
          }
        } else {
          if (isIpApiUrl) {
            info(
              `[${proxy.name}] ip-api status=${status} invalid response, log only`,
            );
          } else if (shouldWriteCache) {
            info(`[${proxy.name}] write failed cache`);
            cache.set(id, {});
          }
        }
      }
    } catch (e) {
      error(`[${proxy.name}] ${e.message ?? e}`);
      if (isIpApiUrl && !internal) {
        info(`[${proxy.name}] ip-api error/timeout, log only`);
        return;
      }
      if (shouldWriteCache) {
        info(`[${proxy.name}] write failed cache`);
        cache.set(id, {});
      }
    }
  }

  async function getIpApiResult(proxy, queryServer, startedAt, index) {
    const ipApiCacheId = getIpApiCacheId(queryServer);
    const cachedIpApi = ipApiRawCacheReadEnabled
      ? cache.get(ipApiCacheId, 0, true)
      : null;
    if (cachedIpApi) {
      return {
        api: cachedIpApi,
        status: 200,
        latency: "",
        source: "persistent-cache",
      };
    }

    if (useCache && ipApiRequestCache.has(queryServer)) {
      return { ...ipApiRequestCache.get(queryServer), source: "shared-cache" };
    }

    if (ipApiInFlight.has(queryServer)) {
      const sharedResult = await ipApiInFlight.get(queryServer);
      return { ...sharedResult, source: "shared-inflight" };
    }

    const requestTask = (async () => {
      ipApiRequestCount += 1;
      const res = await http({
        proxy: `http://${http_meta_host}:${http_meta_ports[index]}`,
        method,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1",
        },
        url: isIpApiUrl
          ? getIpApiUrl(queryServer)
          : formatter({
              proxy: { ...proxy, server: queryServer },
              format: url,
            }),
      });
      let api = String(lodash_get(res, "body"));
      try {
        api = JSON.parse(api);
      } catch (e) {}
      const payload = {
        api,
        status: parseInt(res.status || res.statusCode || 200, 10),
        latency: `${Date.now() - startedAt}`,
      };
      if (useCache) {
        ipApiRequestCache.set(queryServer, payload);
      }
      return payload;
    })();

    ipApiInFlight.set(queryServer, requestTask);
    try {
      const networkResult = await requestTask;
      return { ...networkResult, source: "network" };
    } finally {
      ipApiInFlight.delete(queryServer);
    }
  }

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

  function applyEgressInfo(proxy = {}, api = {}) {
    proxy.egressIp = getReturnedIp(api);
    proxy.egressCountryCode = api.countryCode;
    proxy.egressRegion = api.region;
    proxy.egressCity = api.city;
    proxy.egressIsp = api.isp;
  }

  function applyEgressGroup(proxy = {}, api = {}) {
    const groupCode = getOrCreateGroupCode(getReturnedIp(api));
    if (!groupCode) return;
    proxy.egressGroup = groupCode;
  }

  function formatIpApiInfo(api = {}) {
    const parts = [
      api.country || "",
      api.regionName || "",
      api.city || "",
      api.isp || "",
      api.as || "",
    ].filter((v) => String(v).trim() !== "");
    return parts.join(", ");
  }

  function formatCountryAsoAsInfo(api = {}) {
    const parts = [
      api.countryCode || "",
      api.aso || "",
      api.as || api.aso || "",
    ]
      .map((v) => String(v).trim())
      .filter(Boolean);
    return parts.join(", ");
  }

  function getReturnedIp(api = {}) {
    return api?.query || api?.ip || "";
  }

  function getOrCreateGroupCode(ip = "") {
    const key = String(ip || "").trim();
    if (!key) return "";
    if (egressGroupMap.has(key)) {
      return egressGroupMap.get(key);
    }
    egressGroupSeq += 1;
    const groupCode = String(egressGroupSeq).padStart(2, "0");
    egressGroupMap.set(key, groupCode);
    return groupCode;
  }

  function getServerWithPort(proxy = {}) {
    const server = String(proxy?._origin_server ?? proxy?.server ?? "").trim();
    const port = proxy?._origin_port ?? proxy?.port;
    const hasPort = port !== undefined && port !== null && String(port) !== "";
    return hasPort ? `${server}:${port}` : server;
  }

  function formatServerWithIp(serverWithPort = "", api = {}) {
    const ip = getReturnedIp(api);
    return ip ? `${serverWithPort}, ${ip}` : serverWithPort;
  }

  function logCountryCodeAso(proxy = {}, api = {}) {
    const text = formatCountryAsoAsInfo(api);
    info(`[${proxy.name}] ${text}`);
  }

  function getCacheId(proxy, queryServer) {
    return `egress:${url}:${format}:${regex}:${internal}:${getMmdbCacheVariant()}:${queryServer}:${JSON.stringify(
      Object.fromEntries(
        Object.entries(proxy).filter(([key]) => {
          const re = new RegExp(uniq_key);
          return re.test(key);
        }),
      ),
    )}`;
  }

  function getMmdbCacheVariant() {
    if (!internal) return "";
    return [
      mmdb_country_path ||
        eval("process.env.SUB_STORE_MMDB_COUNTRY_PATH") ||
        "",
      mmdb_asn_path || eval("process.env.SUB_STORE_MMDB_ASN_PATH") || "",
    ].join("|");
  }

  function getIpApiCacheId(ip) {
    return `egress:ip-api:${ip}`;
  }

  function getIpApiUrl(ip) {
    const query = String(url).split("?")[1];
    return `http://ip-api.com/json/${encodeURIComponent(ip)}${query ? `?${query}` : ""}`;
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
            error(`Regex parse error: ${e.message}`);
          }
        }
      }
      api = { ...api, ...extracted };
    }

    let f = format.replace(/\{\{(.*?)\}\}/g, "${$1}");
    return eval(`\`${f}\``);
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
