$server.subscriptionName = $server._subName;

let ipIsp = $server.ipIsp
  .replace(/.*China Mobile.*/, "CM")
  .replace(/.*China Unicom.*/, "CU")
  .replace(/.*Chinanet.*/, "CT")
  .replace(/.*Amazon.*/, "AMZ")
  .replace(/.*Microsoft.*/, "Azure")
  .replace(/.*Cloudflare.*/, "CF")
  .replace(/.*Chunghwa Telecom.*/, "HiNet")
  .replace(/.*HostPapa.*/, "HPAPA")
  .replace(/.*NetLab.*/, "NetLab")
  .replace(/.*Hong Kong Telecommunications.*/, "HKT")
  .replace(/.*Alibaba.*/, "Ali")
  .replace(/networks?|technology|(?:co|ltd|inc)\.|pty ltd|,/gi, "")
  .trim()
  .split(" ")
  .at(-1);

$server.name = [
  $server.ipCountryCode,
  $server.ipRegion.replace(/^\d+$/, ""),
  // $server.ipCity,
  ipIsp,
  "-",
  $server.name,
  $server?.canAccessOpenai ? "GPT" : "",
  $server?.canAccessGemini ? "GM" : "",
  $server?.canAccessClaude ? "CL" : "",
]
  .join(" ")
  .replace(/\s{2,}/, " ")
  .trim();
