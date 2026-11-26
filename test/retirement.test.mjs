import { normalize, project, contributionSplit, taxableSocialSecurity, taxBill, compoundReal, marginalRate, takeHome, retireNeed, lifeNeed, planSpend, planCheck, startAges, DEFAULTS } from "../js/retirement-model.js";

let failed = 0;
function check(name, cond) { print((cond ? "ok  " : "FAIL ") + name); if (!cond) failed += 1; }
function near(name, a, b, tol) { if (Math.abs(a - b) > tol) print("     got " + a + " expected " + b); check(name, Math.abs(a - b) <= tol); }

const base = normalize({});
check("the default expected return is the building-block 7.9%", base.avg === 0.079);
check("which the shifted history compounds at about 3.7% after inflation",
  Math.abs(compoundReal(base) - 0.037) < 0.001);

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
const ar = (1 + base.avg) / (1 + base.inflation) - 1;
check("compound real return sits about 2 points under the average", ar - cr > 0.015 && ar - cr < 0.025);

const lines = project(base);
check("the plan first, the median last and for fun", lines.length === 3 && lines[0].key === "bad" && lines[1].key === "below" && lines[2].key === "mid");
check("the median supports the most spending", lines[2].burn >= lines[1].burn);
check("cutting back allows more spending", lines[1].burn >= lines[0].burn);
print("burns " + lines.map((l) => l.burn).join(", ") + "; compound real " + (cr * 100).toFixed(2) + "%");

const th = takeHome(normalize({ salary: 200000, savePct: 15, account: "traditional" }), 0, 29);
near("take-home at $200k single, CA: pay less tax, payroll, and the 401(k)", th.live, 200000 - 30854 - 11932.36 - 16939 - 24500, 1);
near("owning outright swaps rent for carrying costs", retireNeed(normalize({ housingMonth: 3000, home: "own", ownCarry: 15000 }), 100000).need, 100000 - 36000 + 15000, 0.01);
near("still renting keeps the rent", retireNeed(normalize({ housingMonth: 3000, home: "rent", ownCarry: 15000 }), 100000).need, 100000, 0.01);

if (failed) { print(failed + " failed"); } else print("all passed");

{
  const base = normalize({ salary: 200000, savePct: 15 });
  const a = takeHome(base, 0, 29);
  const b = takeHome({ ...base, otherSaveMonth: 2000 }, 0, 29);
  if (Math.abs(a.live - b.live - 24000) > 1e-6 || b.other !== 24000) throw new Error("outside saving should come off take-home");
  if (normalize({ otherSaveMonth: "1500" }).otherSaveMonth !== 1500) throw new Error("otherSaveMonth parse");
  print("ok  saving outside the 401(k) comes off what you live on");
}

{
  const base = normalize({});
  const life = Math.round(lifeNeed(base) / 1000) * 1000;
  if (planSpend(base) !== life) throw new Error("planSpend should default to what you live on now");
  if (planSpend(normalize({ spendAdjust: -10000 })) !== life - 10000) throw new Error("planSpend adjustment");
  print("ok  spending is what you live on now plus your change");
}

{
  const raw = normalize({ mega: true });
  const input = { ...raw, annualSpend: planSpend(raw) };
  const ages = startAges(input);
  if (ages.length !== input.retireAge - input.age) throw new Error("one point per start age, today to the year before retiring");
  const plan = ages.map((a) => a.lines[0].saved);
  for (let i = 1; i < plan.length; i++) {
    if (plan[i - 1] == null && plan[i] != null) throw new Error("once a start age can't reach 9 in 10, later ones can't either");
    if (plan[i] != null && ages[i].lines[0].payShare < ages[i - 1].lines[0].payShare) throw new Error("waiting never needs a smaller share");
  }
  for (const a of ages) {
    const [p90, p75, p50] = a.lines.map((l) => (l.payShare == null ? Infinity : l.payShare));
    if (!(p90 >= p75 && p75 >= p50)) throw new Error("9 in 10 needs at least what 3 in 4 needs, which needs at least half");
  }
  if (Math.abs(ages[0].odds - planCheck(input).success) > 0.011) throw new Error("starting now at today's rate matches the verdict");
  for (let i = 1; i < ages.length; i++) if (ages[i].odds > ages[i - 1].odds) throw new Error("waiting never helps the odds");
  print("ok  later starts need more and last less often; start now matches the verdict");
}
