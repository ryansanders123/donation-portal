import { describe, expect, it } from "vitest";
import { autoDetect, detectionsToMapping } from "../autoDetect";

describe("autoDetect", () => {
  it("maps GiveCentral headers to the expected target fields", () => {
    const headers = [
      "Profile ID",
      "Batch No",
      "First Name",
      "Last Name",
      "Email",
      "Transaction ID",
      "Transaction Date",
      "Amount",
      "Payment Method",
      "Event",
      "Address1",
      "Address2",
      "City",
      "State",
      "Zip",
      "Phone",
    ];
    const dets = autoDetect(headers);
    const map = Object.fromEntries(dets.map((d) => [d.field, d.column]));
    expect(map.donor_external_id).toBe("Profile ID");
    expect(map.donor_first_name).toBe("First Name");
    expect(map.donor_last_name).toBe("Last Name");
    expect(map.donor_email).toBe("Email");
    expect(map.external_id).toBe("Transaction ID");
    expect(map.date_received).toBe("Transaction Date");
    expect(map.amount).toBe("Amount");
    expect(map.type).toBe("Payment Method");
    expect(map.appeal_name).toBe("Event");
    expect(map.donor_address_line1).toBe("Address1");
    expect(map.donor_address_line2).toBe("Address2");
    expect(map.donor_city).toBe("City");
    expect(map.donor_state).toBe("State");
    expect(map.donor_zip).toBe("Zip");
    expect(map.donor_phone).toBe("Phone");
  });

  it("maps a generic excel sheet of donor/date/amount/fund", () => {
    const headers = ["Donor Name", "Date", "Amount", "Fund"];
    const map = Object.fromEntries(
      autoDetect(headers).map((d) => [d.field, d.column]),
    );
    expect(map.donor_name).toBe("Donor Name");
    expect(map.date_received).toBe("Date");
    expect(map.amount).toBe("Amount");
    expect(map.fund_name).toBe("Fund");
  });

  it("maps Bloomerang Donations.csv headers", () => {
    const headers = [
      "Amount",
      "AppealName",
      "CampaignName",
      "FundName",
      "Note",
      "TransactionNumber",
      "CreatedDate",
    ];
    const map = Object.fromEntries(
      autoDetect(headers).map((d) => [d.field, d.column]),
    );
    expect(map.amount).toBe("Amount");
    expect(map.appeal_name).toBe("AppealName");
    expect(map.campaign_name).toBe("CampaignName");
    expect(map.fund_name).toBe("FundName");
    expect(map.note).toBe("Note");
    expect(map.external_id).toBe("TransactionNumber");
    expect(map.date_received).toBe("CreatedDate");
  });

  it("does not claim a single column for two fields", () => {
    const headers = ["Name"];
    const dets = autoDetect(headers);
    // "Name" matches donor_name; nothing else for it.
    expect(dets.length).toBe(1);
    expect(dets[0].field).toBe("donor_name");
  });

  it("detectionsToMapping defaults type to cash and sets email blocklist", () => {
    const mapping = detectionsToMapping([
      { field: "amount", column: "Amount", confidence: 1 },
    ]);
    expect(mapping.constants.type).toBe("cash");
    expect(mapping.matchDoneeByNameAddress).toBe(true);
    expect(mapping.emailBlocklist).toContain("noemail@noemail.com");
  });
});
