import { normalize, project, contributionSplit, taxableSocialSecurity, taxBill, compoundReal, marginalRate, DEFAULTS } from "../js/retirement-model.js";

let failed = 0;
function check(name, cond) { print((cond ? "ok  " : "FAIL ") + name); if (!cond) failed += 1; }
function near(name, a, b, tol) { if (Math.abs(a - b) > tol) print("     got " + a + " expected " + b); check(name, Math.abs(a - b) <= tol); }

const base = normalize({});
check("the default expected return is the companion's 9%", base.avg === 0.09);

const pre = contributionSplit(normalize({ salary: 100000, savePct: 10, account: "traditional" }), 0, 30);
near("pre-tax: a dollar of pay is a dollar in", pre.pre, 10000, 0.01);
const roth = contributionSplit(normalize({ salary: 100000, savePct: 10, account: "roth" }), 0, 30);
const t = marginalRate(100000, "single");
near("single $100,000 is 22% federal plus 9.3% California", t, 0.313, 1e-9);
near("Roth: a dollar of pay is 1 - t in", roth.roth, 10000 * (1 - t), 0.01);
const capped = contributionSplit(normalize({ salary: 400000, savePct: 20, account: "roth" }), 0, 30);
near("the Roth cap still binds on deposits", capped.roth, 24500, 0.01);

near("thresholds unchanged today", taxableSocialSecurity(30000, 20000, "single", 1), 0.5 * (34000 - 25000) + 0.85 * (35000 - 34000), 0.01);
const later = taxableSocialSecurity(30000, 20000, "single", 0.5);
check("deflated thresholds tax more of the benefit later", later > 5000);

const one = taxBill(60000, 0, "joint", "traditional", 66).federal;
near("married 65+ gets the extra deduction for both spouses", one, (60000 - 32200 - 3300) * 0.1 + 0 , 0.01);

const cr = compoundReal(base);
const ar = (1.09 / 1.025) - 1;
check("compound real return sits about 2 points under the average", ar - cr > 0.015 && ar - cr < 0.025);

const lines = project(base);
check("two lines, the plan first", lines.length === 2 && lines[0].key === "bad" && lines[1].key === "below");
check("cutting back allows more spending", lines[1].burn >= lines[0].burn);
print("burns " + lines.map((l) => l.burn).join(", ") + "; compound real " + (cr * 100).toFixed(2) + "%");

if (failed) { print(failed + " failed"); } else print("all passed");
