/**
 * xmlBuilder.js
 * Structure based on what actually worked in Tally Prime EDU:
 *   ALLINVENTORYENTRIES.LIST (one per item)
 *     → ACCOUNTINGALLOCATIONS.LIST (Sales ledger inside each item)
 *   LEDGERENTRIES.LIST (Customer)
 *   LEDGERENTRIES.LIST (CGST)
 *   LEDGERENTRIES.LIST (SGST)
 *
 * Sign rules (from working single-item version):
 *   Sales (inside item)  → ISDEEMEDPOSITIVE=Yes, AMOUNT negative
 *   Customer             → ISDEEMEDPOSITIVE=No,  AMOUNT positive
 *   CGST                 → ISDEEMEDPOSITIVE=Yes, AMOUNT negative
 *   SGST                 → ISDEEMEDPOSITIVE=Yes, AMOUNT negative
 */

function buildVoucherXML(order, calculatedItems, totals) {
  const date = formatTallyDate(order.date || new Date());
  const voucherNumber = order.voucherNumber || "1";

  const inventoryEntries = calculatedItems
    .map((item) => buildInventoryEntry(item))
    .join("\n");

  return `<ENVELOPE>
 <HEADER>
  <TALLYREQUEST>Import Data</TALLYREQUEST>
 </HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>Vouchers</REPORTNAME>
    <STATICVARIABLES>
     <SVCURRENTCOMPANY>Test Automation</SVCURRENTCOMPANY>
    </STATICVARIABLES>
   </REQUESTDESC>
   <REQUESTDATA>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <VOUCHER VCHTYPE="Sales" ACTION="Create">
      <DATE>${date}</DATE>
      <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
      <VOUCHERNUMBER>${voucherNumber}</VOUCHERNUMBER>
      <PARTYLEDGERNAME>${order.customer}</PARTYLEDGERNAME>
${inventoryEntries}
      <LEDGERENTRIES.LIST>
       <LEDGERNAME>${order.customer}</LEDGERNAME>
       <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
       <AMOUNT>${totals.total}</AMOUNT>
      </LEDGERENTRIES.LIST>
      <LEDGERENTRIES.LIST>
       <LEDGERNAME>CGST</LEDGERNAME>
       <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
       <AMOUNT>-${totals.cgst}</AMOUNT>
      </LEDGERENTRIES.LIST>
      <LEDGERENTRIES.LIST>
       <LEDGERNAME>SGST</LEDGERNAME>
       <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
       <AMOUNT>-${totals.sgst}</AMOUNT>
      </LEDGERENTRIES.LIST>
     </VOUCHER>
    </TALLYMESSAGE>
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>`;
}

function buildInventoryEntry(item) {
  return `      <ALLINVENTORYENTRIES.LIST>
       <STOCKITEMNAME>${item.name}</STOCKITEMNAME>
       <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
       <RATE>${item.rate}/pcs</RATE>
       <AMOUNT>-${item.amount}</AMOUNT>
       <ACTUALQTY>${item.qty} pcs</ACTUALQTY>
       <BILLEDQTY>${item.qty} pcs</BILLEDQTY>
       <ACCOUNTINGALLOCATIONS.LIST>
        <LEDGERNAME>Sales</LEDGERNAME>
        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
        <AMOUNT>-${item.amount}</AMOUNT>
       </ACCOUNTINGALLOCATIONS.LIST>
      </ALLINVENTORYENTRIES.LIST>`;
}

function formatTallyDate(date) {
  const [yyyy, mm, dd] = String(date).split("-");
  if (yyyy && mm && dd) return `${yyyy}${mm}${dd}`;
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
}

module.exports = { buildVoucherXML };