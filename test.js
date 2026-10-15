async function operator(proxies, targetPlatform, context) {
  const proxyServerNameserver = ProxyUtils.yaml.load(context.raw[0]).dns[
    'proxy-server-nameserver'
  ][0];

  const domains = [
    ...new Set(
      proxies.map((proxy) => {
        return '+.' + proxy.server.split('.').slice(-2).join('.');
      })
    ),
  ].join(',');

  $substore.write({ [domains]: proxyServerNameserver }, 'proxy-server-nameserver-policy');
}
