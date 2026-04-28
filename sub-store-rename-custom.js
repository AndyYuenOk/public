$server.name = $server.name
  .replace(/China Mobile.*?(?= -)/, "CM")
  .replace(/China Unicom.*?(?= -)/, "CU")
  .replace(/Chinanet/, "CT")
  .replace(/Amazon.*?(?= -)/, "AMZ")
  .replace(/Cloudflare.*?(?= -)/, "CF")
  .replace(/Microsoft.*?(?= -)/, "Azure")
  .replace(/Data Communication.*?(?= -)/, "HiNet")
  .replace(/HostPapa.*?(?= -)/, "HPAPA")
  .replace(/NetLab.*?(?= -)/, "NetLab")
  .replace(/PAN-LIAN.*?(?= -)/, "PL")
  .replace(/(.+?)\s*((\ud83c[\udde6-\uddff]){2})\s*(.+)$/, "$2 $1 $4")
  .replace("  ", " ");
