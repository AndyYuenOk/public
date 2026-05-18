function operator(proxies, targetPlatform, context) {
  const proxyMap = new Map();
  proxies.forEach((proxy) => {
    let key = proxy.name;

    let octets = $arguments.octets ?? 4;
    if (proxy.egress.ip) {
      key = proxy.egress.ip.split(".").slice(0, octets).join(".");
    }

    let egressKey =
      proxy.egress.countryCode +
      proxy.egress.region +
      proxy.egress.city +
      proxy.egress.asn;
    if (/true|1/.test($arguments.geo ?? 0) && egressKey) {
      key = egressKey;
    }

    proxyMap.set(key, proxy);
  });
  return Array.from(proxyMap.values());
}
