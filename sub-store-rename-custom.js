$server.name = $server.name
  .replace(/China Mobile.+?corporation/, "CM")
  .replace(/China Unicom.+?Network/, "CU")
  .replace(/Chinanet/, "CT")
  .replace("Amazon.com, Inc.", "AMZ")
  .replace("Cloudflare, Inc.", "CF")
  .replace("TECHNOLOGY CO., LIMITED", "")
  .replace(/(.+?)\s*((\ud83c[\udde6-\uddff]){2})\s*(.+)$/, "$2 $1 $4")
  .replace("  ", " ");
