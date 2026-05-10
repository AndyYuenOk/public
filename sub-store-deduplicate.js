function operator(proxies, targetPlatform, context) {
  const proxyMap = new Map();
  proxies.forEach((proxy) => {
    let entranceInfo = proxy.entrance.ip;
    let egressInfo = proxy.egress.ip;

    if (/true|1/i.test($arguments.use_asn)) {
      entranceInfo =
        proxy.entrance.countryCode +
        proxy.entrance.region +
        proxy.entrance.city +
        proxy.entrance.asn;

      egressInfo =
        proxy.egress.countryCode +
        proxy.egress.region +
        proxy.egress.city +
        proxy.egress.asn;
    }

    proxyMap.set(
      (entranceInfo || proxy.server) + (egressInfo || proxy.port),
      proxy,
    );
  });
  return Array.from(proxyMap.values());
}
