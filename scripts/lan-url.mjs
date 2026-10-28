// Print de LAN-URL('s) voor telefoons/tablets op hetzelfde netwerk.
// Gebruik: node scripts/lan-url.mjs  (draait automatisch mee met `npm run dev:lan`)
import os from "node:os";

const PORT = 5173;
const nets = os.networkInterfaces();
const ips = [];
for (const list of Object.values(nets)) {
  for (const info of list ?? []) {
    if (info.family === "IPv4" && !info.internal) ips.push(info.address);
  }
}

if (ips.length === 0) {
  console.log("Geen LAN-adapter gevonden — zit je wel op wifi?");
} else {
  console.log("Tuin bereikbaar op je telefoon/tablet (zelfde wifi):");
  for (const ip of ips) console.log(`  http://${ip}:${PORT}`);
}
