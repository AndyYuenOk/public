function operator(proxies, targetPlatform, context) {
  const proxyMap = new Map();
  proxies.forEach((proxy) => {
    let entranceInfo = proxy.entranceIp;
    let egressInfo = proxy.egressIp;

    if (/true|1/i.test($arguments.use_isp)) {
      egressInfo =
        proxy.egressCountryCode +
        proxy.egressRegion +
        proxy.egressCity +
        proxy.egressIsp;
      entranceInfo =
        proxy.entranceCountryCode +
        proxy.entranceRegion +
        proxy.entranceCity +
        proxy.entranceIsp;
    }

    proxyMap.set(
      (proxy.entranceInfo || proxy.server) + (egressInfo || proxy.port),
      proxy,
    );
  });
  return Array.from(proxyMap.values());
}
