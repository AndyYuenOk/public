function operator(proxies, targetPlatform, context) {
  proxies
    .sort((a, b) => parseSpeedToKb(b.name) - parseSpeedToKb(a.name))
    .map((proxy) => (proxy.name = proxy.name.replaceAll("|", " ")));
  return proxies;
}
function parseSpeedToKb(name) {
  const speed = name.split("|")[1];
  if (speed.includes("MB/s")) {
    return parseFloat(speed) * 1024;
  } else if (speed.includes("KB/s")) {
    return parseFloat(speed);
  } else {
    return -1;
  }
}
