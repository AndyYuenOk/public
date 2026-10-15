async function operator(proxies, targetPlatform, context) {
  const config = ProxyUtils.yaml.load(context.raw[0]);
  const domains = [
    ...new Set(
      proxies.map((proxy) => {
        return '+.' + proxy.server.split('.').slice(-2).join('.');
      })
    ),
  ].join(',');
  const nameserver = config.dns['proxy-server-nameserver'][0];

  const proxyServerNameserverPolicy = $substore.read('proxy-server-nameserver-policy') ?? {};
  proxyServerNameserverPolicy ??= {};
  proxyServerNameserverPolicy[domains] = nameserver;

  $substore.write(proxyServerNameserverPolicy, 'proxy-server-nameserver-policy');
}
