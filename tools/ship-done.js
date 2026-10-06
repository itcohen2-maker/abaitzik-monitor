const fs = require("fs");
const path = require("path");

// ship-done.js: apply a shipment alert as "handled" for 7 days.
// Validates id and code, then appends or updates handled.json.
// No Claude, no network, just Node.

async function shipDone(shipDir, msg) {
  if (!msg || typeof msg !== "string") throw new Error("no message");
  const parts = msg.split(String.fromCharCode(10)); // newline
  if (parts.length < 2) throw new Error("bad format");

  const [id, code] = parts;
  if (!id || !code) throw new Error("missing id or code");

  // Load rows.json to validate id and code.
  const rowsFile = path.join(shipDir, "rows.json");
  const rows = JSON.parse(fs.readFileSync(rowsFile, "utf8"));
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error("id not found");

  // Load alerts.json to find the code.
  const alertsFile = path.join(shipDir, "alerts.json");
  const alertIds = JSON.parse(fs.readFileSync(alertsFile, "utf8"));
  const rowAlerts = alertIds[id] || [];
  if (!rowAlerts.includes(code)) throw new Error("code not in row alerts");

  // Load or create handled.json.
  const handledFile = path.join(shipDir, "handled.json");
  let handled = {};
  if (fs.existsSync(handledFile)) {
    handled = JSON.parse(fs.readFileSync(handledFile, "utf8"));
  }

  // Write the handled entry.
  if (!handled[id]) handled[id] = {};
  handled[id][code] = {
    code,
    at: new Date().toISOString(),
    by: "app", // app or email or user name.
  };

  fs.writeFileSync(handledFile, JSON.stringify(handled, null, 2), "utf8");
  console.log("handled", id, code);
}

if (require.main === module) {
  const shipDir = process.argv[2] || "/srv/homestyle/shipments";
  const msg = process.argv[3] || process.env.SHIP_DONE_MSG;
  if (!msg) {
    console.error("usage: node ship-done.js <shipDir> <id\ncode>");
    process.exit(1);
  }
  shipDone(shipDir, msg).catch((e) => {
    console.error("error:", e.message);
    process.exit(1);
  });
}

module.exports = { shipDone };
