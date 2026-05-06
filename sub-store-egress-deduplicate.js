function operator(proxies, targetPlatform, context) {
  const proxyMap = new Map();
  proxies.forEach((proxy) => {
    let egressInfo = proxy.egressIp;

    if (/true|1/i.test($arguments.use_isp)) {
      egressInfo =
        proxy.egressCountryCode +
        proxy.egressRegionName +
        proxy.egressCity +
        proxy.egressIsp;
    }

    proxyMap.set(
      (proxy.entranceIp || proxy.server) + (egressInfo || proxy.port),
      proxy,
    );
  });
  return Array.from(proxyMap.values());
}
