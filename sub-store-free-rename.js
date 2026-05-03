function operator(proxies = [], targetPlatform, context) {
  proxies.forEach((proxy) => {
    proxy.name = [
      ...proxy.name.split("|"),
      proxy?.canAccessOpenai ? "GPT" : "",
      proxy?.canAccessGemini ? "GM" : "",
      proxy?.canAccessClaude ? "CL" : "",
    ].join(" ");
  });
  return proxies;
}
