// In-memory test harness only. No AWS requests or production credentials.
const vm = require("node:vm");
const { readFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");
const filename = path.resolve(__dirname, "../../backend/api/index.cjs");
const realRequire = createRequire(filename);

function loadApi({ send = async () => ({}), environment = {} } = {}) {
  class Client { async send(command) { return send(command); } }
  const context = {
    exports: {}, Buffer, URL, Date, setTimeout, clearTimeout,
    console: { log() {}, warn() {}, error() {} },
    process: { env: { USERS_TABLE: "unit-users", CONSULTANTS_TABLE: "unit-consultants", BOOKINGS_TABLE: "unit-bookings", ...environment } },
    require(name) {
      const actual = realRequire(name);
      if (name === "@aws-sdk/lib-dynamodb") return { ...actual, DynamoDBDocumentClient: { from: () => new Client() } };
      if (name.startsWith("@aws-sdk/client-")) return Object.fromEntries(Object.entries(actual).map(([key, value]) => [key, key.endsWith("Client") ? Client : value]));
      return actual;
    }
  };
  vm.runInNewContext(readFileSync(filename, "utf8") + "\nexports.test = { scanWithFilter, queryConsultantsByStatus, scanAllItems, buildAdminMetrics, bookingForViewer, parseBody, isVisibleConsultant, sendEmail };", context, { filename });
  return context.exports;
}
module.exports = { loadApi };
