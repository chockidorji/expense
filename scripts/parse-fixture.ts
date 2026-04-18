/* eslint-disable no-console */
import { promises as fs } from "node:fs";
import path from "node:path";
import { detectBankAndParse } from "../lib/parsers";

/**
 * Fixture naming convention:
 *   *-skip.txt         — expects detectBankAndParse() to return null (non-transaction notification)
 *   everything else    — expects a non-null ParsedTransaction
 */
async function main() {
  const dir = path.join(process.cwd(), "scripts", "fixtures");
  const files = (await fs.readdir(dir)).filter(f => f.endsWith(".txt")).sort();
  let pass = 0, fail = 0;
  for (const f of files) {
    const raw = await fs.readFile(path.join(dir, f), "utf8");
    const [headerBlock, ...bodyParts] = raw.split(/\n\n/);
    const body = bodyParts.join("\n\n");
    const fromHeader = headerBlock.match(/^From:\s*(.*)$/im)?.[1] ?? "";
    const subject = headerBlock.match(/^Subject:\s*(.*)$/im)?.[1] ?? "";
    const expectNull = /-skip\.txt$/.test(f);
    const result = detectBankAndParse({ fromHeader, subject, plainText: body, htmlText: "" });
    console.log(`\n=== ${f} ${expectNull ? "(expect null)" : ""} ===`);
    if (expectNull) {
      if (result === null) {
        console.log("PASS — correctly skipped");
        pass++;
      } else {
        console.log("FAIL — expected null, got", JSON.stringify(result));
        fail++;
      }
    } else if (result) {
      console.log("PASS", JSON.stringify(result, null, 2));
      pass++;
    } else {
      console.log("FAIL — no match");
      fail++;
    }
  }
  console.log(`\nSummary: ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}
main().catch(e => { console.error(e); process.exit(1); });
