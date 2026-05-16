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

  let useCache = context.egressCache ?? 1;
  const shouldWriteCache = true;

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

  let valid = $arguments.valid || `ProxyUtils.isIP('{{api.ip || api.query}}')`;
  const shouldRename = Boolean($arguments.format);
  let format = $arguments.format || "";
  let url = "http://ip-api.com/json?lang=en";
  const ippureUrl = $arguments.ippure_api || "https://my.ippure.com/v1/info";
  const ipwhoUrl = $arguments.ipwho_api || "https://ipwho.is/";
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

  const isIpApiUrl = /^https?:\/\/ip-api\.com\/json(?:\/|\?|$)/i.test(url);
  const ipApiInFlight = new Map();
  const ipApiRequestCache = new Map();
  const { sourceName, sourceStore } = getSourceCacheContext(context.source);
  const nodeCount = proxies.length;
  let ipApiRequestCount = 0;
  const pendingLogsByIndex = new Map();
  const completedLogIndices = new Set();
  let nextLogIndex = 0;

  if (useCache) {
    for (const proxy of Array.isArray(proxies) ? proxies : []) {
      const serverWithPort = getServerWithPort(proxy);

      // Keep output fields deterministic in cache-only mode.
      applyEgressInfo(proxy, {});

      const cachedEntry = getStructuredEgressEntry(serverWithPort);
      const cachedApi = mergeApiResult(
        cachedEntry?.egress?.["ip-api"],
        cachedEntry?.egress?.ippure,
        cachedEntry?.egress?.ipwho,
      );
      if (hasMergedApiData(cachedApi)) {
        const cacheInfo = internal
          ? formatCountryAsoAsInfo(cachedApi)
          : formatIpApiInfo(cachedApi);
        info(
          `USE CACHE, [${proxy.name}] ${formatServerWithIp(serverWithPort, cachedApi)}, ${cacheInfo}`,
        );
        applyEgressInfo(proxy, cachedApi);
        if (shouldRename) {
          proxy.name = formatter({
            proxy,
            api: cachedApi,
            format,
            regex,
          });
        }
        proxy._egress = cachedApi;
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

    const uniqueEgressIpCount = new Set(
      proxies
        .map((proxy) => String(proxy?.egress?.ip ?? "").trim())
        .filter(Boolean),
    ).size;
    info(
      `[stats] nodes: ${nodeCount}, dual-api requests: ${ipApiRequestCount}, unique egress ip: ${uniqueEgressIpCount}`,
    );
    logBoundary("END");
    return finalize(proxies);
  }

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
    return finalize(proxies);
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

  const uniqueEgressIpCount = new Set(
    proxies
      .map((proxy) => String(proxy?.egress?.ip ?? "").trim())
      .filter(Boolean),
  ).size;
  info(
    `[stats] nodes: ${nodeCount}, dual-api requests: ${ipApiRequestCount}, unique egress ip: ${uniqueEgressIpCount}`,
  );
  logBoundary("END");
  return finalize(proxies);

  async function check(proxy) {
    const index = internalProxies.indexOf(proxy);
    if (index < 0) return;

    const serverWithPort = getServerWithPort(proxy);
    const queryServer = String(proxy.server || "").trim();
    const targetProxy = proxies[proxy._proxies_index];

    // Always prefill egress fields to empty values.
    // This keeps downstream scripts stable when cache is miss/failed-only.
    applyEgressInfo(targetProxy, {});

    try {
      if (useCache) {
        const cachedEntry = getStructuredEgressEntry(serverWithPort);
        const cachedApi = mergeApiResult(
          cachedEntry?.egress?.["ip-api"],
          cachedEntry?.egress?.ippure,
          cachedEntry?.egress?.ipwho,
        );
        if (hasMergedApiData(cachedApi)) {
          const cacheInfo = internal
            ? formatCountryAsoAsInfo(cachedApi)
            : formatIpApiInfo(cachedApi);
          info(
            `USE CACHE, [${proxy.name}] ${formatServerWithIp(serverWithPort, cachedApi)}, ${cacheInfo}`,
          );
          applyEgressInfo(targetProxy, cachedApi);
          if (shouldRename) {
            targetProxy.name = formatter({
              proxy: targetProxy,
              api: cachedApi,
              format,
              regex,
            });
          }
          targetProxy._egress = cachedApi;
          return;
        }

        if (cachedEntry) {
          if (disableFailedCache) {
            info(`[${proxy.name}] skip failed cache`);
          } else {
            info(`USE CACHE, [${proxy.name}] error`);
          }
        } else {
          info(`USE CACHE, [${proxy.name}] miss`);
        }
        return;
      }

      const startedAt = Date.now();
      let api = {};

      if (internal) {
        const res = await http({
          proxy: `http://${http_meta_host}:${http_meta_ports[index]}`,
          method,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
          },
          url,
        });

        const ip = String(lodash_get(res, "body", "")).trim();
        api = {
          countryCode: utils.geoip(ip) || "",
          aso: utils.ipaso(ip) || "",
          query: ip,
        };
        if (shouldWriteCache) {
          setStructuredEgressEntry({
            serverWithPort,
            ipApi: api,
            ippure: {},
            ipwho: {},
          });
        }

        if (
          (api.countryCode || api.aso) &&
          eval(formatter({ api, format: valid, regex }))
        ) {
          applyEgressInfo(targetProxy, api);
          if (shouldRename) {
            targetProxy.name = formatter({
              proxy: targetProxy,
              api,
              format,
              regex,
            });
          }
          targetProxy._egress = api;
          info(
            `[${proxy.name}] ${formatServerWithIp(serverWithPort, api)}, ${formatCountryAsoAsInfo(api)}`,
          );
        }
      } else {
        const ipApiResult = await getIpApiResult(
          proxy,
          serverWithPort,
          queryServer,
          startedAt,
          index,
        );
        api = ipApiResult.api;
        const status = ipApiResult.status;
        if (shouldWriteCache) {
          setStructuredEgressEntry({
            serverWithPort,
            ipApi: ipApiResult?.sourceApi?.["ip-api"] ?? {},
            ippure: ipApiResult?.sourceApi?.ippure ?? {},
            ipwho: ipApiResult?.sourceApi?.ipwho ?? {},
          });
        }

        const validApi = eval(formatter({ api, format: valid, regex }));
        if (status === 200 && validApi) {
          applyEgressInfo(targetProxy, api);
          if (shouldRename) {
            targetProxy.name = formatter({
              proxy: targetProxy,
              api,
              format,
              regex,
            });
          }
          targetProxy._egress = api;
          if (ipApiResult.source === "network") {
            enqueueFinalResultLog(
              index,
              `[${proxy.name}] ${formatServerWithIp(serverWithPort, api)}, ${formatIpApiInfo(api)}`,
            );
          }
        } else {
          if (isIpApiUrl) {
            enqueueRequestStatusLog(
              index,
              `[${proxy.name}] dual-api invalid response, log only`,
            );
          } else {
            enqueueRequestStatusLog(
              index,
              `[${proxy.name}] invalid response, skip cache update`,
            );
          }
        }
      }
    } catch (e) {
      error(`[${proxy.name}] ${e.message ?? e}`);
      if (isIpApiUrl && !internal) {
        enqueueRequestStatusLog(
          index,
          `[${proxy.name}] dual-api error/timeout, log only`,
        );
        return;
      }
      enqueueRequestStatusLog(
        index,
        `[${proxy.name}] request failed, skip cache update`,
      );
    } finally {
      markNodeLogCompleted(index);
    }
  }

  async function getIpApiResult(
    proxy,
    serverWithPort,
    queryServer,
    startedAt,
    index,
  ) {
    const requestKey = String(serverWithPort || queryServer || "").trim();
    if (useCache) {
      if (ipApiRequestCache.has(requestKey)) {
        return { ...ipApiRequestCache.get(requestKey), source: "shared-cache" };
      }

      if (ipApiInFlight.has(requestKey)) {
        const sharedResult = await ipApiInFlight.get(requestKey);
        return { ...sharedResult, source: "shared-inflight" };
      }
    }

    const requestTask = (async () => {
      ipApiRequestCount += 1;
      const proxyUrl = `http://${http_meta_host}:${http_meta_ports[index]}`;
      const headers = {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1",
      };

      let api = {};
      let status = 500;
      let sourceApi = {
        "ip-api": {},
        ippure: {},
        ipwho: {},
      };

      if (isIpApiUrl) {
        const [ipApiSettled, ippureSettled] = await Promise.allSettled([
          requestJson({
            proxy: proxyUrl,
            method,
            headers,
            url: getIpApiUrl(queryServer),
          }),
          requestJson({
            proxy: proxyUrl,
            method,
            headers,
            url: ippureUrl,
          }),
        ]);

        const ipApiPayload = getSettledPayload(ipApiSettled);
        const ippurePayload = getSettledPayload(ippureSettled);
        let ipwhoPayload = {
          ok: false,
          status: 0,
          api: {},
          error: "",
          rawBody: "",
          titlePreview: "",
          bodyPreview: "",
        };

        if (!ipApiPayload.ok) {
          if (isRequestTimeoutError(ipApiPayload)) {
            enqueueRequestStatusLog(
              index,
              `[${proxy.name}] dual-api error [ip-api]: ${formatApiErrorDetail(ipApiPayload)}, timeout, skip ipwho fallback`,
            );
          } else {
            enqueueRequestStatusLog(
              index,
              `[${proxy.name}] dual-api error [ip-api]: ${formatApiErrorDetail(ipApiPayload)}, trigger ipwho fallback`,
            );
            ipwhoPayload = await requestJson({
              proxy: proxyUrl,
              method,
              headers,
              url: getIpwhoUrl(),
            });
            if (ipwhoPayload.ok) {
              const normalizedIpwho = normalizeIpwhoApi(ipwhoPayload.api);
              const normalizedOk = hasMergedApiData(normalizedIpwho);
              ipwhoPayload = {
                ...ipwhoPayload,
                ok: normalizedOk,
                api: normalizedOk ? normalizedIpwho : {},
                error: normalizedOk
                  ? ipwhoPayload.error
                  : "empty ipwho payload",
              };
            }
            if (!ipwhoPayload.ok) {
              enqueueRequestStatusLog(
                index,
                `[${proxy.name}] dual-api error [ipwho]: ${formatApiErrorDetail(ipwhoPayload)}`,
              );
            }
          }
        }
        if (!ippurePayload.ok) {
          enqueueRequestStatusLog(
            index,
            `[${proxy.name}] dual-api error [ippure]: ${formatApiErrorDetail(ippurePayload)}`,
          );
        }

        api = mergeApiResult(
          ipApiPayload.api,
          ippurePayload.api,
          ipwhoPayload.api,
        );
        status =
          ipApiPayload.ok || ippurePayload.ok || ipwhoPayload.ok ? 200 : 500;
        sourceApi = {
          "ip-api": isPlainObject(ipApiPayload.api) ? ipApiPayload.api : {},
          ippure: sanitizeIppurePayload(ippurePayload.api),
          ipwho: isPlainObject(ipwhoPayload.api) ? ipwhoPayload.api : {},
        };
      } else {
        const res = await http({
          proxy: proxyUrl,
          method,
          headers,
          url: formatter({
            proxy: { ...proxy, server: queryServer },
            format: url,
          }),
        });
        api = String(lodash_get(res, "body"));
        try {
          api = JSON.parse(api);
        } catch (e) {}
        status = parseInt(res.status || res.statusCode || 200, 10);
        sourceApi = {
          "ip-api": isPlainObject(api) ? api : {},
          ippure: {},
          ipwho: {},
        };
      }

      const payload = {
        api,
        status,
        latency: `${Date.now() - startedAt}`,
        sourceApi,
      };
      if (useCache) {
        ipApiRequestCache.set(requestKey, payload);
      }
      return payload;
    })();

    if (useCache) {
      ipApiInFlight.set(requestKey, requestTask);
      try {
        const networkResult = await requestTask;
        return { ...networkResult, source: "network" };
      } finally {
        ipApiInFlight.delete(requestKey);
      }
    }

    const networkResult = await requestTask;
    return { ...networkResult, source: "network" };
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
    proxy.egress = {
      ip: getReturnedIp(api) ?? "",
      countryCode: api.countryCode ?? "",
      country: api.country ?? "",
      regionCode: api.region ?? "",
      region: api.regionName ?? "",
      city: api.city ?? "",
      isp: api.isp ?? "",
      org: api.org ?? "",
      asn: api.asn ?? "",
      isResidential:
        typeof api.isResidential === "boolean" ? api.isResidential : "",
    };
  }

  function formatIpApiInfo(api = {}) {
    const residentialValue =
      typeof api.isResidential === "boolean"
        ? `isResidential ${api.isResidential}`
        : "";
    const parts = [
      api.country || "",
      api.regionName || "",
      api.city || "",
      residentialValue,
      api.isp || "",
      api.asn || "",
    ].filter((v) => String(v).trim() !== "");
    return parts.join(", ");
  }

  function formatCountryAsoAsInfo(api = {}) {
    const parts = [
      api.countryCode || "",
      api.aso || "",
      api.asn || api.aso || "",
    ]
      .map((v) => String(v).trim())
      .filter(Boolean);
    return parts.join(", ");
  }

  function getReturnedIp(api = {}) {
    return api?.query || api?.ip || "";
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

  function getStructuredEgressEntry(serverWithPort = "") {
    const safeServerWithPort = String(serverWithPort || "").trim();
    if (!safeServerWithPort) return null;
    const entry = sourceStore[safeServerWithPort];
    return isPlainObject(entry) ? entry : null;
  }

  function setStructuredEgressEntry({
    serverWithPort = "",
    ipApi = {},
    ippure = {},
    ipwho = {},
  } = {}) {
    const safeServerWithPort = String(serverWithPort || "").trim();
    if (!safeServerWithPort) return;
    const existingEntry = isPlainObject(sourceStore[safeServerWithPort])
      ? sourceStore[safeServerWithPort]
      : {};

    sourceStore[safeServerWithPort] = {
      ...existingEntry,
      egress: {
        "ip-api": sanitizeEgressIpApiPayload(ipApi),
        ippure: sanitizeIppurePayload(ippure),
        ipwho: sanitizeIpwhoPayload(ipwho),
      },
    };
  }

  function getIpApiUrl(ip) {
    return "http://ip-api.com/json?lang=en";
  }

  function getIpwhoUrl() {
    const normalizedBase = String(ipwhoUrl || "").trim() || "https://ipwho.is/";
    return normalizedBase;
  }

  function mergeApiResult(ipApi = {}, ippure = {}, ipwho = {}) {
    const merged = isPlainObject(ipApi) ? { ...ipApi } : {};
    merged.asn = extractAsnCode(merged.asn || merged.as || "");
    const sanitizedIppure = sanitizeIppurePayload(ippure);
    if (typeof sanitizedIppure.isResidential === "boolean") {
      merged.isResidential = sanitizedIppure.isResidential;
    }
    if (isPlainObject(ipwho)) {
      if (!merged.query && ipwho.query) {
        merged.query = ipwho.query;
      }
      if (!merged.ip && ipwho.ip) {
        merged.ip = ipwho.ip;
      }
      if (!merged.country && ipwho.country) {
        merged.country = ipwho.country;
      }
      if (!merged.countryCode && ipwho.countryCode) {
        merged.countryCode = ipwho.countryCode;
      }
      if (!merged.region && ipwho.region) {
        merged.region = ipwho.region;
      }
      if (!merged.regionName && ipwho.regionName) {
        merged.regionName = ipwho.regionName;
      }
      if (!merged.city && ipwho.city) {
        merged.city = ipwho.city;
      }
      if (!merged.isp && ipwho.isp) {
        merged.isp = ipwho.isp;
      }
      if (!merged.org && ipwho.org) {
        merged.org = ipwho.org;
      }
      if (!merged.asn && ipwho.asn) {
        merged.asn = ipwho.asn;
      }
    }
    delete merged.as;
    return merged;
  }

  function normalizeIpwhoApi(source = {}) {
    if (!isPlainObject(source)) {
      return {};
    }
    const connection = isPlainObject(source.connection)
      ? source.connection
      : {};
    const asn = Number(connection.asn);
    const asnCode = Number.isFinite(asn) && asn > 0 ? `AS${asn}` : "";
    const query = String(source.ip || "").trim();

    return {
      query,
      ip: query,
      countryCode: String(source.country_code || "").trim(),
      country: String(source.country || "").trim(),
      region: String(source.region_code || "").trim(),
      regionName: String(source.region || "").trim(),
      city: String(source.city || "").trim(),
      isp: String(connection.isp || connection.org || "").trim(),
      org: String(connection.org || "").trim(),
      asn: asnCode,
    };
  }

  function extractAsnCode(value = "") {
    const text = String(value || "").toUpperCase();
    const matched = text.match(/\bAS\d+\b/);
    return matched ? matched[0] : "";
  }

  function hasMergedApiData(api = {}) {
    if (!isPlainObject(api)) return false;
    return Boolean(api.ip || api.query || api.countryCode || api.country);
  }

  function sanitizeIppurePayload(source = {}) {
    if (!isPlainObject(source)) return {};
    if (typeof source.isResidential !== "boolean") return {};
    return { isResidential: source.isResidential };
  }
  function sanitizeEgressIpApiPayload(source = {}) {
    if (!isPlainObject(source)) return {};
    const sanitized = { ...source };
    delete sanitized.status;
    delete sanitized.lat;
    delete sanitized.lon;
    delete sanitized.timezone;
    return sanitized;
  }
  function sanitizeIpwhoPayload(source = {}) {
    if (!isPlainObject(source)) return {};
    const sanitized = { ...source };
    delete sanitized.query;
    return sanitized;
  }

  function isPlainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
  }

  async function requestJson(opt = {}) {
    try {
      const res = await http(opt);
      const rawBody = String(lodash_get(res, "body", ""));
      let api = rawBody;
      try {
        api = JSON.parse(api);
      } catch (e) {}
      const status = parseInt(res.status || res.statusCode || 200, 10);
      const ok = status >= 200 && status < 300 && isPlainObject(api);
      const previews = ok
        ? { titlePreview: "", bodyPreview: "" }
        : extractTitleAndBody(rawBody);
      return {
        ok,
        status,
        api: ok ? api : {},
        error: ok ? "" : "request failed",
        rawBody: ok ? "" : rawBody,
        titlePreview: previews.titlePreview,
        bodyPreview: previews.bodyPreview,
      };
    } catch (e) {
      return {
        ok: false,
        status: 0,
        api: {},
        error: e?.message ?? String(e),
        rawBody: "",
        titlePreview: "",
        bodyPreview: "",
      };
    }
  }

  function getSettledPayload(settled = {}) {
    if (settled?.status === "fulfilled") {
      return (
        settled.value || {
          ok: false,
          status: 0,
          api: {},
          error: "",
          rawBody: "",
          titlePreview: "",
          bodyPreview: "",
        }
      );
    }
    return {
      ok: false,
      status: 0,
      api: {},
      error: settled?.reason?.message ?? String(settled?.reason ?? ""),
      rawBody: "",
      titlePreview: "",
      bodyPreview: "",
    };
  }

  function formatApiErrorDetail(payload = {}) {
    const detail = String(payload?.error ?? "").trim();
    const titlePreview = String(payload?.titlePreview ?? "").trim();
    const bodyPreview = String(payload?.bodyPreview ?? "").trim();
    const extraParts = [];
    if (titlePreview) {
      extraParts.push(`title: ${titlePreview}`);
    }
    if (bodyPreview) {
      extraParts.push(`body: ${bodyPreview}`);
    }
    if (detail) {
      return extraParts.length > 0
        ? `${detail}, ${extraParts.join(", ")}`
        : detail;
    }
    return extraParts.length > 0
      ? `unknown error, ${extraParts.join(", ")}`
      : "unknown error";
  }

  function isRequestTimeoutError(payload = {}) {
    const text = [
      payload?.error ?? "",
      payload?.titlePreview ?? "",
      payload?.bodyPreview ?? "",
    ]
      .map((value) => String(value).toLowerCase())
      .join(" ");
    return text.includes("timeout");
  }

  function enqueueRequestStatusLog(proxyIndex, message = "") {
    enqueueNodeLog(proxyIndex, message);
  }

  function enqueueFinalResultLog(proxyIndex, message = "") {
    enqueueNodeLog(proxyIndex, message);
  }

  function enqueueNodeLog(proxyIndex, message = "") {
    const index = Number.isInteger(proxyIndex)
      ? proxyIndex
      : Number.MAX_SAFE_INTEGER;
    if (index === Number.MAX_SAFE_INTEGER) {
      info(String(message));
      return;
    }
    if (!pendingLogsByIndex.has(index)) {
      pendingLogsByIndex.set(index, []);
    }
    pendingLogsByIndex.get(index).push(String(message));
  }

  function markNodeLogCompleted(proxyIndex) {
    if (!Number.isInteger(proxyIndex) || proxyIndex < 0) return;
    completedLogIndices.add(proxyIndex);
    flushInOrderNodeLogs();
  }

  function flushInOrderNodeLogs() {
    while (completedLogIndices.has(nextLogIndex)) {
      const logs = pendingLogsByIndex.get(nextLogIndex) || [];
      for (const message of logs) {
        info(message);
      }
      pendingLogsByIndex.delete(nextLogIndex);
      completedLogIndices.delete(nextLogIndex);
      nextLogIndex += 1;
    }
  }

  function extractTitleAndBody(raw = "") {
    const source = String(raw ?? "");
    if (!source.trim()) {
      return {
        titlePreview: "",
        bodyPreview: "",
      };
    }

    const titleMatch = source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    const titleRaw = titleMatch?.[1] ?? "";
    const bodyWithoutCode = removeNonTextBlocks(source);
    const strippedTitle = normalizeWhitespace(stripHtmlTags(titleRaw));
    const strippedBody = normalizeWhitespace(stripHtmlTags(bodyWithoutCode));

    return {
      titlePreview: truncateText(strippedTitle, 160),
      bodyPreview: truncateText(strippedBody, 160),
    };
  }

  function removeNonTextBlocks(text = "") {
    return String(text ?? "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ");
  }

  function stripHtmlTags(text = "") {
    return String(text ?? "").replace(/<[^>]*>/g, " ");
  }

  function normalizeWhitespace(text = "") {
    return String(text ?? "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function truncateText(text = "", limit = 160) {
    const value = String(text ?? "");
    if (!Number.isFinite(limit) || limit <= 0) {
      return "";
    }
    if (value.length <= limit) {
      return value;
    }
    if (limit <= 3) {
      return value.slice(0, limit);
    }
    return `${value.slice(0, limit - 3)}...`;
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
