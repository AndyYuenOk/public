function operator(proxies, targetPlatform, context) {
  const proxyMap = new Map();
  proxies.forEach((proxy) => {
    let octets = $arguments.octets ?? 4;
    let key = proxy.name;
    if (proxy.egress.ip) {
      key = proxy.egress.ip.split(".").slice(0, octets).join(".");
    }
    proxyMap.set(key, proxy);
  });
  return Array.from(proxyMap.values());
}
