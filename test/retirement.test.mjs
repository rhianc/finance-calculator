import { normalize, project, contributionSplit, taxableSocialSecurity, taxBill, compoundReal, marginalRate, takeHome, retireNeed, lifeNeed, planSpend, planCheck, adaptivePlan, oddsFrom, DEFAULTS } from "../js/retirement-model.js";

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
  const plan = adaptivePlan(input);
  const W = input.retireAge - input.age;
  if (plan.ages.length !== W) throw new Error("one amount per working year");
  const [nine, three, half] = plan.plans.map((p) => p.typical);
  if (!(nine[0].payShare >= three[0].payShare && three[0].payShare >= half[0].payShare)) throw new Error("more certainty takes more now");
  // Replay each walk and check its amounts against the year-by-year simulation.
  const replay = (rows, market, t) => {
    let pre = input.balance;
    let roth = 0;
    for (let k = 0; k < W; k++) {
      const r = rows[k];
      if (k % 9 === 0 && !r.over && r.payShare > 0) {
        if (oddsFrom(input, k, pre, roth, r.payShare) < t) throw new Error("amount at " + r.age + " lasts in " + t);
        if (oddsFrom(input, k, pre, roth, r.payShare - 0.005) >= t) throw new Error("half a point less at " + r.age + " does not");
      }
      const split = contributionSplit({ ...input, savePct: r.payShare }, k, input.age + k + 1);
      const m = market[k];
      pre = pre * (1 + m) + split.pre * (1 + m / 2);
      roth = roth * (1 + m) + split.roth * (1 + m / 2);
    }
  };
  replay(nine, plan.markets.typical, 0.9);
  replay(plan.plans[0].rough, plan.markets.rough, 0.9);
  replay(three, plan.markets.typical, 0.75);
  // Typical markets leave the careful plan ahead: by the end it needs less than the half plan, and below-average
  // markets need more than typical ones through the middle years.
  const last = W - 3;
  if (!(nine[last].payShare < half[last].payShare)) throw new Error("careful plan needs less than the half plan near the end");
  const mid = (rows) => rows.slice(10, 25).reduce((a, r) => a + r.payShare, 0);
  if (!(mid(plan.plans[0].rough) > mid(nine))) throw new Error("below-average markets need more than typical ones");
  if (Math.abs(plan.youOdds - planCheck(input, 0).success) > 0.04) throw new Error("your rate's odds today are close to the verdict");
  print("ok  amount to save: careful plan starts higher, ends lower; rough markets need more; matches the simulation");
}
