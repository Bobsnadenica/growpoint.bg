// In-memory test harness only. No AWS requests or production credentials.
const vm = require("node:vm");
const { readFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");
const filename = path.resolve(__dirname, "../../backend/api/index.cjs");
const realRequire = createRequire(filename);

function loadApi({ send = async () => ({}), environment = {}, presign, logError = () => {} } = {}) {
  class Client { async send(command) { return send(command); } }
  const context = {
    exports: {}, Buffer, URL, Date, setTimeout, clearTimeout,
    console: { log() {}, warn() {}, error: logError },
    process: { env: { USERS_TABLE: "unit-users", CONSULTANTS_TABLE: "unit-consultants", BOOKINGS_TABLE: "unit-bookings", ...environment } },
    require(name) {
      const actual = realRequire(name);
      if (name === "@aws-sdk/s3-request-presigner" && presign) return { ...actual, getSignedUrl: presign };
      if (name === "@aws-sdk/lib-dynamodb") return { ...actual, DynamoDBDocumentClient: { from: () => new Client() } };
      if (name.startsWith("@aws-sdk/client-")) return Object.fromEntries(Object.entries(actual).map(([key, value]) => [key, key.endsWith("Client") ? Client : value]));
      return actual;
    }
  };
  vm.runInNewContext(readFileSync(filename, "utf8") + "\nexports.test = { getMeProfile, getBookableAvailability, bookedSlotsSnapshot, stripSensitiveConsultantFields, createBooking, rescheduleBooking, confirmBookingSession, updateMeProfile, updateMyConsultant, createUploadUrl, validateStoredDocuments, getMyNotifications, markMyNotificationsRead, redeemInvite, awardProfileCompletionIfEligible, setConsultantFeatured, setUserRestricted, applyAutomaticVisibility, setConsultantVisibility, setConsultantPackage, bootstrapUser, scanWithFilter, queryConsultantsByStatus, scanAllItems, buildAdminMetrics, bookingForViewer, parseBody, isVisibleConsultant, sendEmail, sendBookingReminderEmails, sendDueReminders, termsAcceptance, refundFreePointsIfNeeded, listBookings, exportMyData };", context, { filename });
  vm.runInNewContext("exports.test.adminDskUatConfig = adminDskUatConfig; exports.test.adminDskUatCreate = adminDskUatCreate; exports.test.adminDskUatGet = adminDskUatGet;", context);
  vm.runInNewContext("exports.test.submitReview = submitReview;", context);
  vm.runInNewContext("Object.assign(exports.test, { getMyBenefitRequests, createMyBenefitRequest, adminListBenefitRequests, adminUpdateBenefitRequest, updateBookingStatus, expertBenefitsSummary });", context);
  vm.runInNewContext("exports.test.deniedAwsAction = deniedAwsAction;", context);
  vm.runInNewContext("exports.test.assertAuthValidAfter = assertAuthValidAfter;", context);
  return context.exports;
}
module.exports = { loadApi };
