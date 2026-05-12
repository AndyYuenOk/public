/**
 * Sub-Store Entrance Script (Node.js)
 *
 * Purpose:
 * - Query entrance IP geo/ASN information for each proxy
 * - Optionally rename proxies using response fields
 * - Optionally attach `_entrance` payload for downstream scripts
 *
 * Notes:
 * - With `internal=true`, lookup target must be an IP
 * - With `resolve_domain=true`, Node.js environment is required
 * - Domain resolution failures are treated as failed nodes
 *
 * Common params:
 * - retries, retry_delay, concurrency
 * - internal, resolve_domain
 * - method, timeout, api
 * - format, regex, valid
 * - uniq_key, entrance, remove_failed
 * - cache, disable_failed_cache / ignore_failed_error
 */
async function operator(proxies = [], targetPlatform, context) {
  let useCache = context.entranceCache ?? 1;

  const shouldWriteCache = true;
  const $ = $substore;
  const info = (msg = "") => console.log(`[entrance] ${msg}`);
  const error = (msg = "") => console.log(`[entrance] ${msg}`);
  const logBoundary = (phase = "") =>
    info(
      `==================== [SUB-STORE-ENTRANCE ${phase}] ====================`,
    );
  logBoundary("START");
  const { isNode } = $.env;
  const internal = /true|1/.test($arguments.internal ?? 0);
  const mmdb_country_path = $arguments.mmdb_country_path;
  const mmdb_asn_path = $arguments.mmdb_asn_path;
  const resolveDomain = /true|1/.test($arguments.resolve_domain ?? 1);
  const regex = $arguments.regex;
  const shouldRename = Boolean($arguments.format);
  let valid = $arguments.valid || `ProxyUtils.isIP('{{api.ip || api.query}}')`;
  let format = $arguments.format || "";
  let utils;
  let dns;
  if (resolveDomain) {
    if (!isNode) {
      logBoundary("END");
      throw new Error(
        "resolve_domain is only supported in Node.js environment",
      );
    }
    dns = require("dns").promises;
  }
  if (internal) {
    if (isNode) {
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
    } else {
      // Non-Node runtime fallback requires platform utilities ($utils).
      if (
        typeof $utils === "undefined" ||
        typeof $utils.geoip === "undefined" ||
        typeof $utils.ipaso === "undefined"
      ) {
        error(
          `Only Surge/Loon (build >= 692) apps with $utils.ipaso and $utils.geoip are supported`,
        );
        logBoundary("END");
        throw new Error(
          "Unsupported internal IP lookup in current environment, check logs",
        );
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
  const method = $arguments.method || "get";
  const url =
    $arguments.api || `http://ip-api.com/json/{{proxy.server}}?lang=en`;
  const isIpApiUrl = /^https?:\/\/ip-api\.com\/json\//i.test(url);
  const { sourceName, sourceStore } = getSourceCacheContext(context.source);
  const nodeCount = proxies.length;
  let ipApiRequestCount = 0;
  const concurrency = parseInt($arguments.concurrency || 10); // Batch concurrency
  const shouldLogResolveDns =
    !useCache &&
    resolveDomain &&
    proxies.some((proxy) => {
      const server = String(proxy?.server || "").trim();
      return server && !ProxyUtils.isIP(server);
    });
  if (shouldLogResolveDns) {
    info("Resolve DNS locally");
  }
  const proxyContexts = new Array(proxies.length);
  await executeAsyncTasks(
    proxies.map((proxy, index) => async () => {
      proxyContexts[index] = await buildProxyContext(proxy);
    }),
    { concurrency },
  );
  if (shouldLogResolveDns) {
    info("Resolve DNS locally completed");
  }

  const groupedByQueryServer = new Map();
  for (const context of proxyContexts) {
    if (!context) continue;
    if (context.resolveError) {
      handleContextFailure(context, context.resolveError);
      continue;
    }
    const key = String(context.queryServer || "");
    if (!groupedByQueryServer.has(key)) {
      groupedByQueryServer.set(key, []);
    }
    groupedByQueryServer.get(key).push(context);
  }

  await executeAsyncTasks(
    Array.from(groupedByQueryServer.values()).map(
      (groupContexts) => async () => processQueryServerGroup(groupContexts),
    ),
    { concurrency },
  );

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

  const uniqueEntranceIpCount = new Set(
    proxies
      .map((proxy) => String(proxy?.entrance?.ip ?? "").trim())
      .filter(Boolean),
  ).size;
  info(
    `[stats] nodes: ${nodeCount}, ip-api requests: ${ipApiRequestCount}, unique entrance ip: ${uniqueEntranceIpCount}`,
  );

  logBoundary("END");
  return finalize(proxies);

  async function buildProxyContext(proxy = {}) {
    let queryServer = String(proxy.server || "").trim();
    const serverWithPort = getServerWithPort(proxy);
    const originalServer = queryServer;
    if (useCache) {
      return {
        proxy,
        queryServer,
        originalServer,
        serverWithPort,
        resolveError: null,
      };
    }
    try {
      queryServer = await getQueryServer(proxy);
      return {
        proxy,
        queryServer,
        originalServer,
        serverWithPort,
        resolveError: null,
      };
    } catch (e) {
      return {
        proxy,
        queryServer,
        originalServer,
        serverWithPort,
        resolveError: e,
      };
    }
  }

  async function processQueryServerGroup(groupContexts = []) {
    if (!groupContexts.length) return;
    const queryServer = groupContexts[0]?.queryServer ?? "";
    const pendingContexts = [];

    for (const context of groupContexts) {
      const { proxy, serverWithPort } = context;
      if (useCache) {
        const cachedEntry = getStructuredEntranceEntry(serverWithPort);
        const cachedApi = cachedEntry?.entrance?.["ip-api"];
        if (cachedApi) {
          const cacheInfo = internal
            ? formatCountryAsoAsInfo(cachedApi)
            : formatIpApiInfo(cachedApi);
          info(
            `USE CACHE, [${proxy.name}] ${formatServerWithIp(serverWithPort, cachedApi, queryServer)}, ${cacheInfo}`,
          );
          applyEntranceInfo(proxy, cachedApi);
          if (shouldRename) {
            proxy.name = formatter({ proxy, api: cachedApi, format, regex });
          }
          proxy._entrance = cachedApi;
          continue;
        }
        if (cachedEntry) {
          if (disableFailedCache) {
            info(`[${proxy.name}] skip failed cache (cache-only)`);
          } else {
            info(`USE CACHE, [${proxy.name}] error`);
          }
        } else {
          info(`USE CACHE, [${proxy.name}] miss`);
        }
        continue;
      }
      pendingContexts.push(context);
    }

    if (useCache || !pendingContexts.length) return;

    if (internal) {
      const api = {
        countryCode: utils.geoip(queryServer) || "",
        aso: utils.ipaso(queryServer) || "",
      };
      const validApi =
        (api.countryCode || api.aso) &&
        eval(formatter({ api, format: valid, regex }));
      for (const context of pendingContexts) {
        const { proxy, originalServer, serverWithPort } = context;
        if (validApi) {
          const queryText =
            originalServer && originalServer !== queryServer
              ? `${originalServer} -> ${queryServer}`
              : `${queryServer}`;
          applyEntranceInfo(proxy, api);
          if (shouldRename) {
            proxy.name = formatter({ proxy, api, format, regex });
          }
          proxy._entrance = api;
          info(
            `[${proxy.name}] ${formatServerWithIp(serverWithPort, api, queryText)}, ${formatCountryAsoAsInfo(api)}`,
          );
          if (shouldWriteCache) {
            setStructuredEntranceEntry({ serverWithPort, ipApi: api });
          }
        }
      }
      return;
    }

    try {
      const ipApiResult = await getIpApiResult(
        groupContexts[0].proxy,
        queryServer,
        Date.now(),
      );
      const api = ipApiResult.api;
      const status = ipApiResult.status;
      const validApi = eval(formatter({ api, format: valid, regex }));

      if (status == 200 && validApi) {
        const deduplicatedByGroup = pendingContexts.length > 1;
        for (const context of pendingContexts) {
          const { proxy, serverWithPort } = context;
          applyEntranceInfo(proxy, api);
          if (shouldRename) {
            proxy.name = formatter({ proxy, api, format, regex });
          }
          proxy._entrance = api;
          if (deduplicatedByGroup) {
            info(
              `[${proxy.name}] ${formatServerWithIp(serverWithPort, api, queryServer)}, ${formatIpApiInfo(api)}, deduplicated`,
            );
          } else {
            info(
              `[${proxy.name}] ${formatServerWithIp(serverWithPort, api, queryServer)}, ${formatIpApiInfo(api)}`,
            );
          }
          if (shouldWriteCache) {
            setStructuredEntranceEntry({ serverWithPort, ipApi: api });
          }
        }
      } else {
        for (const context of pendingContexts) {
          const { proxy } = context;
          if (isIpApiUrl) {
            info(`[${proxy.name}] ip-api invalid response, log only`);
          }
        }
      }
    } catch (e) {
      for (const context of pendingContexts) {
        handleContextFailure(context, e);
      }
    }
  }

  function handleContextFailure(context = {}, err) {
    const { proxy = {} } = context;
    error(`[${proxy.name}] ${err?.message ?? err}`);
    if (isIpApiUrl && !internal) {
      info(`[${proxy.name}] ip-api error/timeout, log only`);
      return;
    }
  }
  // HTTP request helper
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
          // $.info(`Request failed ${count} time(s): ${e.message || e}, retry in ${delay / 1000}s`)
          await $.wait(delay);
          return await fn();
        } else {
          throw e;
        }
      }
    };
    return await fn();
  }
  function getIpApiUrl(ip) {
    const query = String(url).split("?")[1];
    return `http://ip-api.com/json/${encodeURIComponent(ip)}${query ? `?${query}` : ""}`;
  }
  async function getIpApiResult(proxy, queryServer, startedAt) {
    ipApiRequestCount += 1;
    const res = await http({
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
    return {
      api,
      status: parseInt(res.status || res.statusCode || 200),
      latency: `${Date.now() - startedAt}`,
    };
  }
  function formatIpApiInfo(api = {}) {
    const asnCode = extractAsnCode(api.asn || api.as || api.aso || "");
    const parts = [
      api.country || "",
      api.regionName || "",
      api.city || "",
      api.isp || "",
      asnCode || api.aso || "",
    ].filter((v) => String(v).trim() !== "");
    return parts.join(", ");
  }
  function formatCountryAsoAsInfo(api = {}) {
    const asnCode = extractAsnCode(api.asn || api.as || api.aso || "");
    const parts = [
      api.countryCode || "",
      api.aso || "",
      asnCode || api.aso || "",
    ]
      .map((v) => String(v).trim())
      .filter(Boolean);
    return parts.join(", ");
  }
  function applyEntranceInfo(proxy = {}, api = {}) {
    proxy.entrance = {
      ip: getReturnedIp(api),
      countryCode: api.countryCode,
      country: api.country,
      regionCode: api.region,
      city: api.city,
      region: api.regionName,
      isp: api.isp,
      asn: extractAsnCode(api.asn || api.as || api.aso || ""),
    };
    // Clear legacy flat fields to avoid mixed output during transition.
    delete proxy.entranceIp;
    delete proxy.entranceCountryCode;
    delete proxy.entranceCountry;
    delete proxy.entranceRegionCode;
    delete proxy.entranceCity;
    delete proxy.entranceRegion;
    delete proxy.entranceIsp;
    delete proxy.entranceAsn;
    delete proxy.entranceGroup;
  }
  async function getQueryServer(proxy) {
    const server = String(proxy.server || "").trim();
    if (!resolveDomain || !server || ProxyUtils.isIP(server)) {
      return server;
    }
    const resolved = await resolveServer(server);
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
        throw new Error("No usable IP returned");
      }
      return resolved;
    } catch (e) {
      throw new Error(
        `Local DNS resolve failed: ${server} (${e.message ?? e})`,
      );
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
  function getReturnedIp(api = {}, fallback = "") {
    return api?.query || api?.ip || fallback || "";
  }
  function extractAsnCode(value = "") {
    const text = String(value || "").toUpperCase();
    const matched = text.match(/\bAS\d+\b/);
    return matched ? matched[0] : "";
  }
  function getServerWithPort(proxy = {}) {
    const server = String(proxy?.server ?? "").trim();
    const port = proxy?.port;
    const hasPort = port !== undefined && port !== null && String(port) !== "";
    return hasPort ? `${server}:${port}` : server;
  }
  function formatServerWithIp(serverWithPort = "", api = {}, fallbackIp = "") {
    const ip = getReturnedIp(api, fallbackIp);
    return ip ? `${serverWithPort}, ${ip}` : serverWithPort;
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
  function logCountryCodeAso(proxy = {}, api = {}) {
    const text = formatCountryAsoAsInfo(api);
    info(`[${proxy.name}] ${text}`);
  }
  function getSourceCacheContext(source) {
    const firstSource = Object.values(source)[0];
    const sourceName = `${firstSource.name}-${firstSource.displayName}`;
    const sourceStore = $.read(`#${sourceName}`) ?? {};
    return { sourceName, sourceStore };
  }
  function finalize(result) {
    $.write(sourceStore, `#${sourceName}`);
    return result;
  }
  function getStructuredEntranceEntry(serverWithPort = "") {
    const safeServerWithPort = String(serverWithPort || "").trim();
    if (!safeServerWithPort) return null;
    const entry = sourceStore[safeServerWithPort];
    return isPlainObject(entry) ? entry : null;
  }
  function setStructuredEntranceEntry({
    serverWithPort = "",
    ipApi = {},
  } = {}) {
    const safeServerWithPort = String(serverWithPort || "").trim();
    if (!safeServerWithPort) return;
    const existingEntry = isPlainObject(sourceStore[safeServerWithPort])
      ? sourceStore[safeServerWithPort]
      : {};
    sourceStore[safeServerWithPort] = {
      ...existingEntry,
      entrance: {
        "ip-api": sanitizeEntranceIpApiPayload(ipApi),
      },
    };
  }
  function sanitizeEntranceIpApiPayload(source = {}) {
    if (!isPlainObject(source)) return {};
    const sanitized = { ...source };
    delete sanitized.status;
    delete sanitized.zip;
    delete sanitized.lat;
    delete sanitized.lon;
    delete sanitized.timezone;
    return sanitized;
  }
  function isPlainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
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
