// Historical stock-year paths, in today's dollars. Spend is after-tax.
// Not a full tax return.

export const DEFAULTS = {
  age: 28,
  retireAge: 65,
  endAge: 90,
  balance: 50000,
  annualSpend: 70000,
  ssAnnual: 24000,
  ssAge: 67,
  inflationPct: 2.5,
  avgPct: 10,
  belowPct: 7,
  badPct: 4,
  account: "traditional",
  filing: "single",
  salary: 120000,
  savePct: 15,
  raisePct: 1,
  mega: false,
};

// Tax year 2026. Held fixed because balances are already in today's dollars.
// IRS Rev. Proc. 2025-32. California FTB 2026 schedules.
const FED = {
  single: {
    std: 16100,
    aged: 2050,
    brackets: [
      [12400, 0.1],
      [50400, 0.12],
      [105700, 0.22],
      [201775, 0.24],
      [256225, 0.32],
      [640600, 0.35],
      [Infinity, 0.37],
    ],
  },
  joint: {
    std: 32200,
    aged: 1650,
    brackets: [
      [24800, 0.1],
      [100800, 0.12],
      [211400, 0.22],
      [403550, 0.24],
      [512450, 0.32],
      [768700, 0.35],
      [Infinity, 0.37],
    ],
  },
};

const CA = {
  single: {
    std: 5900,
    credit: 158,
    brackets: [
      [11456, 0.01],
      [27157, 0.02],
      [42861, 0.04],
      [59498, 0.06],
      [75197, 0.08],
      [384109, 0.093],
      [460927, 0.103],
      [768213, 0.113],
      [Infinity, 0.123],
    ],
  },
  joint: {
    std: 11800,
    credit: 316,
    brackets: [
      [22912, 0.01],
      [54314, 0.02],
      [85722, 0.04],
      [118996, 0.06],
      [150394, 0.08],
      [768218, 0.093],
      [921854, 0.103],
      [1536426, 0.113],
      [Infinity, 0.123],
    ],
  },
};

const SS_BASE = { single: 25000, joint: 32000 };
const SS_SECOND = { single: 34000, joint: 44000 };

export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

export function realAnnual(nominal, inflation) {
  return (1 + nominal) / (1 + inflation) - 1;
}

export function normalize(raw) {
  const age = clamp(Math.round(num(raw.age, DEFAULTS.age)), 18, 80);
  let retireAge = clamp(Math.round(num(raw.retireAge, DEFAULTS.retireAge)), 30, 85);
  if (retireAge <= age) retireAge = Math.min(85, age + 1);
  let endAge = clamp(Math.round(num(raw.endAge, DEFAULTS.endAge)), 50, 110);
  if (endAge <= retireAge) endAge = Math.min(110, retireAge + 1);
  let ssAge = clamp(Math.round(num(raw.ssAge, DEFAULTS.ssAge)), 60, 75);
  return {
    age,
    retireAge,
    endAge,
    balance: clamp(num(raw.balance, DEFAULTS.balance), 0, 50000000),
    annualSave: clamp(num(raw.annualSave, 0), 0, 2000000),
    salary: clamp(num(raw.salary, DEFAULTS.salary), 0, 5000000),
    savePct: clamp(num(raw.savePct, DEFAULTS.savePct), 0, 100) / 100,
    raise: clamp(num(raw.raisePct, DEFAULTS.raisePct), -5, 20) / 100,
    mega: raw.mega === true || raw.mega === 1 || raw.mega === "1" || raw.mega === "on",
    annualSpend: clamp(num(raw.annualSpend, DEFAULTS.annualSpend), 0, 5000000),
    ssAnnual: clamp(num(raw.ssAnnual, DEFAULTS.ssAnnual), 0, 200000),
    ssAge,
    inflation: clamp(num(raw.inflationPct, DEFAULTS.inflationPct), 0, 15) / 100,
    avg: clamp(num(raw.avgPct, DEFAULTS.avgPct), -20, 30) / 100,
    below: clamp(num(raw.belowPct, DEFAULTS.belowPct), -20, 30) / 100,
    bad: clamp(num(raw.badPct, DEFAULTS.badPct), -20, 30) / 100,
    account: raw.account === "roth" ? "roth" : "traditional",
    filing: raw.filing === "joint" ? "joint" : "single",
  };
}

function num(v, fallback) {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

// 2026 workplace limits. Inflation-indexed, so flat in today's dollars.
// Catch-up is on top of the 415(c) annual-additions limit.
const DEFERRAL_2026 = 24500;
const CATCHUP_2026 = 8000;
const SUPER_CATCHUP_2026 = 11250;
const ANNUAL_ADDITIONS_2026 = 72000;

export function irsCap(age, mega) {
  let extra = 0;
  if (age >= 60 && age < 64) extra = SUPER_CATCHUP_2026;
  else if (age >= 50) extra = CATCHUP_2026;
  return (mega ? ANNUAL_ADDITIONS_2026 : DEFERRAL_2026) + extra;
}

/** Dollars saved that year, in today's dollars, after the IRS cap. */
export function yearSave(input, yearsWorked, ageAtYearEnd) {
  const salary = input.salary * Math.pow(1 + input.raise, Math.max(0, yearsWorked));
  const want = salary * input.savePct;
  return Math.max(0, Math.min(want, irsCap(ageAtYearEnd, input.mega), salary));
}

function bracketTax(income, brackets) {
  let tax = 0;
  let prev = 0;
  for (const [top, rate] of brackets) {
    if (income <= prev) break;
    tax += (Math.min(income, top) - prev) * rate;
    prev = top;
  }
  return tax;
}

/** Federal taxable portion of Social Security. Thresholds are not indexed. */
export function taxableSocialSecurity(ss, other, filing) {
  if (ss <= 0) return 0;
  const status = filing === "joint" ? "joint" : "single";
  const base = SS_BASE[status];
  const second = SS_SECOND[status];
  const provisional = Math.max(0, other) + ss * 0.5;
  if (provisional <= base) return 0;
  if (provisional <= second) return Math.min(ss * 0.5, 0.5 * (provisional - base));
  const first = Math.min(ss * 0.5, 0.5 * (second - base));
  return Math.min(ss * 0.85, first + 0.85 * (provisional - second));
}

/**
 * Income tax on one year, in today's dollars.
 * Traditional withdrawals are ordinary income. Roth withdrawals are not.
 * California does not tax Social Security. Age 65 adds the extra federal
 * standard deduction. The temporary $6,000 senior deduction is not included.
 */
export function taxBill(withdrawal, ss, filing, account, age) {
  const status = filing === "joint" ? "joint" : "single";
  const other = account === "roth" ? 0 : Math.max(0, withdrawal);
  const ssTaxable = taxableSocialSecurity(Math.max(0, ss), other, status);
  const fed = FED[status];
  const std = fed.std + (age >= 65 ? fed.aged : 0);
  const federal = bracketTax(Math.max(0, other + ssTaxable - std), fed.brackets);
  const ca = CA[status];
  const caTaxable = Math.max(0, other - ca.std);
  let state = bracketTax(caTaxable, ca.brackets);
  if (caTaxable > 1000000) state += (caTaxable - 1000000) * 0.01;
  state = Math.max(0, state - ca.credit);
  return { federal, state, total: federal + state, ssTaxable };
}

/** Withdrawal that leaves `spend` after tax. Surplus is Social Security not needed. */
export function coverSpend(spend, ss, filing, account, age) {
  const quote = (w) => {
    const bill = taxBill(w, ss, filing, account, age);
    return { withdrawal: w, bill, net: w + Math.max(0, ss) - bill.total };
  };
  const zero = quote(0);
  if (spend <= 0 || zero.net >= spend) {
    return { withdrawal: 0, bill: zero.bill, surplus: Math.max(0, zero.net - Math.max(0, spend)), net: zero.net };
  }
  let lo = 0;
  let hi = Math.max(spend, 1);
  while (quote(hi).net + 0.5 < spend && hi < 50000000) hi *= 2;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (quote(mid).net >= spend) hi = mid;
    else lo = mid;
  }
  const hit = quote(hi);
  return { withdrawal: hit.withdrawal, bill: hit.bill, surplus: 0, net: hit.net };
}

/** What the account pays so the knob's after-tax spending is covered. */
export function spendTax(input) {
  const steadyAge = Math.max(input.retireAge, input.ssAge);
  const steady = coverSpend(input.annualSpend, input.ssAnnual, input.filing, input.account, steadyAge);
  const before =
    input.ssAnnual > 0 && input.retireAge + 0.05 < input.ssAge
      ? coverSpend(input.annualSpend, 0, input.filing, input.account, input.retireAge)
      : null;
  return { steady, before };
}

// S&P 500 total return and CPI, calendar years 1928–2025.
// Damodaran, NYU Stern. Real return pairs the two, so 1974 stays a bad year.
const STOCK = [
  0.4381, -0.0830, -0.2512, -0.4384, -0.0864, 0.4998, -0.0119, 0.4674,
  0.3194, -0.3534, 0.2928, -0.0110, -0.1067, -0.1277, 0.1917, 0.2506,
  0.1903, 0.3582, -0.0843, 0.0520, 0.0570, 0.1830, 0.3081, 0.2368,
  0.1815, -0.0121, 0.5256, 0.3260, 0.0744, -0.1046, 0.4372, 0.1206,
  0.0034, 0.2664, -0.0881, 0.2261, 0.1642, 0.1240, -0.0997, 0.2380,
  0.1081, -0.0824, 0.0356, 0.1422, 0.1876, -0.1431, -0.2590, 0.3700,
  0.2383, -0.0698, 0.0651, 0.1852, 0.3174, -0.0470, 0.2042, 0.2234,
  0.0615, 0.3124, 0.1849, 0.0581, 0.1654, 0.3148, -0.0306, 0.3023,
  0.0749, 0.0997, 0.0133, 0.3720, 0.2268, 0.3310, 0.2834, 0.2089,
  -0.0903, -0.1185, -0.2197, 0.2836, 0.1074, 0.0483, 0.1561, 0.0548,
  -0.3655, 0.2594, 0.1482, 0.0210, 0.1589, 0.3215, 0.1352, 0.0138,
  0.1177, 0.2161, -0.0423, 0.3121, 0.1802, 0.2847, -0.1804, 0.2606,
  0.2488, 0.1778,
];
const CPI = [
  0.0643, 0.0077, -0.0234, -0.0566, -0.1030, -0.0513, 0.0307, 0.0227,
  0.0146, 0.0360, -0.0211, 0.0808, 0.0120, 0.0556, 0.1088, 0.0190,
  0.0170, 0.0234, 0.0833, 0.1459, 0.0244, -0.0211, 0.0123, 0.0790,
  0.0153, 0.0076, -0.0073, 0.0244, 0.0300, 0.0334, 0.0285, 0.0070,
  0.0174, 0.0100, 0.0107, 0.0124, 0.0131, 0.0160, 0.0290, 0.0308,
  0.0427, 0.0546, 0.0584, 0.0430, 0.0327, 0.0616, 0.1103, 0.0913,
  0.0486, 0.0650, 0.0763, 0.1122, 0.1358, 0.1035, 0.0616, 0.0379,
  0.0430, 0.0356, 0.0190, 0.0365, 0.0443, 0.0483, 0.0540, 0.0424,
  0.0295, 0.0297, 0.0267, 0.0281, 0.0333, 0.0229, 0.0156, 0.0268,
  0.0341, 0.0283, 0.0159, 0.0227, 0.0326, 0.0339, 0.0254, 0.0408,
  0.0384, -0.0036, 0.0150, 0.0316, 0.0174, 0.0146, 0.0076, 0.0012,
  0.0207, 0.0213, 0.0191, 0.0181, 0.0123, 0.0704, 0.0650, 0.0340,
  0.0289, 0.0290,
];

const RAW_REAL = STOCK.map((s, i) => (1 + s) / (1 + CPI[i]) - 1);
const HIST_REAL = RAW_REAL.reduce((a, b) => a + b, 0) / RAW_REAL.length;
const N_PATHS = 280;
const BLOCK = 5;
const MAX_YEARS = 100;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fixed block draws so the chart does not reshuffle while a slider moves.
const BLOCKS = (() => {
  const rng = mulberry32(0x5eed);
  const out = [];
  for (let p = 0; p < N_PATHS; p++) {
    const idx = new Array(MAX_YEARS);
    let filled = 0;
    while (filled < MAX_YEARS) {
      const start = Math.floor(rng() * RAW_REAL.length);
      for (let k = 0; k < BLOCK && filled < MAX_YEARS; k++) {
        idx[filled++] = (start + k) % RAW_REAL.length;
      }
    }
    out.push(idx);
  }
  return out;
})();

function cashflows(input) {
  const months = Math.max(1, Math.round((input.endAge - input.age) * 12));
  const retireM = Math.max(0, Math.round((input.retireAge - input.age) * 12));
  const claimM = Math.max(retireM, Math.round((input.ssAge - input.age) * 12));
  const monthWithdraw = new Float64Array(months + 1);
  const monthSurplus = new Float64Array(months + 1);
  for (let y = 0; y * 12 < months; y++) {
    const start = y * 12 + 1;
    const end = Math.min(months, (y + 1) * 12);
    let retiredMonths = 0;
    let ssMonths = 0;
    for (let m = start; m <= end; m++) {
      if (m > retireM) retiredMonths += 1;
      if (m > retireM && m >= claimM) ssMonths += 1;
    }
    if (retiredMonths === 0) continue;
    const spend = (input.annualSpend * retiredMonths) / 12;
    const ss = (input.ssAnnual * ssMonths) / 12;
    const ageAtEnd = input.age + end / 12;
    const bill = coverSpend(spend, ss, input.filing, input.account, ageAtEnd);
    const each = bill.withdrawal / retiredMonths;
    for (let m = start; m <= end; m++) {
      if (m > retireM) monthWithdraw[m] = each;
    }
    if (bill.surplus > 0 && ssMonths > 0) {
      const extra = bill.surplus / ssMonths;
      for (let m = start; m <= end; m++) {
        if (m > retireM && m >= claimM) monthSurplus[m] = extra;
      }
    }
  }
  const years = Math.ceil(months / 12);
  const yearWithdraw = new Float64Array(years);
  const yearSurplus = new Float64Array(years);
  for (let m = 1; m <= months; m++) {
    const y = (m - 1) / 12 | 0;
    yearWithdraw[y] += monthWithdraw[m];
    yearSurplus[y] += monthSurplus[m];
  }
  return { months, retireM, monthWithdraw, monthSurplus, yearWithdraw, yearSurplus };
}

function yearRates(input, years) {
  const target = realAnnual(input.avg, input.inflation);
  const shift = target - HIST_REAL;
  const rates = new Array(N_PATHS);
  for (let p = 0; p < N_PATHS; p++) {
    const idx = BLOCKS[p];
    const real = new Float64Array(years);
    for (let y = 0; y < years; y++) {
      real[y] = Math.min(1.2, Math.max(-0.7, RAW_REAL[idx[y]] + shift));
    }
    rates[p] = real;
  }
  return rates;
}

function runPath(input, flow, real, stopEarly) {
  const { months, retireM, monthWithdraw, monthSurplus } = flow;
  let bal = input.balance;
  let nest = input.balance;
  let depletedAge = null;
  const marks = [0, bal];
  for (let y = 0; y < real.length; y++) {
    const start = y * 12 + 1;
    const end = Math.min(months, (y + 1) * 12);
    if (start > months) break;
    const r = real[y];
    const span = end - start + 1;
    const yearsWorked = Math.max(0, Math.round((start - 1) / 12));
    const saved = yearSave(input, yearsWorked, input.age + end / 12);
    if (end <= retireM && span === 12) {
      bal = bal * (1 + r) + saved * (1 + r * 0.5);
    } else if (start > retireM && span === 12) {
      const w = flow.yearWithdraw[y];
      const s = flow.yearSurplus[y];
      const afterHalf = bal - w * 0.5;
      if (afterHalf <= 0.5 && w > 0.5) {
        bal = 0;
        if (depletedAge == null) depletedAge = input.age + (start - 1) / 12;
        if (stopEarly) break;
      } else {
        bal = Math.max(0, afterHalf) * (1 + r) - w * 0.5 + s;
        if (bal <= 0.5 && w > 0.5) {
          bal = 0;
          if (depletedAge == null) depletedAge = input.age + (start - 1) / 12;
          if (stopEarly) break;
        } else if (bal < 0) {
          bal = 0;
        }
      }
    } else {
      const rm = Math.pow(1 + r, 1 / 12) - 1;
      const monthSave = saved / 12;
      for (let m = start; m <= end; m++) {
        if (m <= retireM) {
          bal = bal * (1 + rm) + monthSave;
          if (m === retireM) nest = bal;
        } else {
          const withdraw = monthWithdraw[m];
          bal -= withdraw;
          if (bal <= 0.5 && withdraw > 0.5) {
            bal = 0;
            if (depletedAge == null) depletedAge = input.age + (m - 1) / 12;
          } else if (bal < 0) {
            bal = 0;
          }
          bal = bal * (1 + rm) + monthSurplus[m];
        }
      }
    }
    if (end === retireM) nest = bal;
    if (end % 12 === 0 || end === months || end === retireM) marks.push(end, Math.max(0, bal));
  }
  return { nest, depletedAge, final: Math.max(0, bal), marks };
}

function atPercent(sorted, p) {
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[i];
}

function successSpend(input, rates, flowOf, threshold) {
  const ok = (spend) => {
    const flow = flowOf(spend);
    const need = Math.ceil(N_PATHS * threshold - 1e-9);
    let live = 0;
    let dead = 0;
    for (let p = 0; p < N_PATHS; p++) {
      if (runPath({ ...input, annualSpend: spend }, flow, rates[p], true).depletedAge == null) {
        live += 1;
        if (live >= need) return true;
      } else {
        dead += 1;
        if (N_PATHS - dead < need) return false;
      }
    }
    return live >= need;
  };
  if (!ok(0)) return 0;
  let lo = 0;
  let hi = 50000;
  while (ok(hi) && hi < 20000000) hi *= 2;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo / 100) * 100;
}

/** Historical-block paths. Lines are the 50th, 25th, and 10th percentile balances. */
export function project(input) {
  const years = Math.max(1, Math.ceil(input.endAge - input.age));
  const rates = yearRates(input, years);
  const base = { ...input };
  const cache = new Map();
  const flowOf = (spend) => {
    let flow = cache.get(spend);
    if (!flow) {
      flow = cashflows({ ...base, annualSpend: spend });
      cache.set(spend, flow);
    }
    return flow;
  };
  const flow = flowOf(input.annualSpend);
  const ran = rates.map((rm) => runPath(input, flow, rm));

  const markIndex = ran[0].marks;
  const ages = [];
  for (let i = 0; i < markIndex.length; i += 2) ages.push(roundAge(input.age + markIndex[i] / 12));

  const series = { avg: [], below: [], bad: [] };
  const pct = { avg: 0.5, below: 0.25, bad: 0.1 };
  for (let i = 1; i < markIndex.length; i += 2) {
    const vals = ran.map((r) => r.marks[i]).sort((a, b) => a - b);
    series.avg.push(atPercent(vals, pct.avg));
    series.below.push(atPercent(vals, pct.below));
    series.bad.push(atPercent(vals, pct.bad));
  }

  const nests = ran.map((r) => r.nest).sort((a, b) => a - b);
  const burns = {
    avg: successSpend(input, rates, flowOf, 0.5),
    below: successSpend(input, rates, flowOf, 0.75),
    bad: successSpend(input, rates, flowOf, 0.9),
  };

  const meta = {
    avg: { name: "Average", note: "half of markets" },
    below: { name: "Below average", note: "1 in 4 worse" },
    bad: { name: "A lot below", note: "1 in 10 worse" },
  };

  return ["avg", "below", "bad"].map((key) => {
    const points = ages.map((age, i) => ({ age, balance: Math.max(0, series[key][i]) }));
    let depletedAge = null;
    for (const pt of points) {
      if (pt.age > input.retireAge + 0.01 && pt.balance <= 0.5) {
        depletedAge = pt.age;
        break;
      }
    }
    const nestPt = points.find((pt) => Math.abs(pt.age - input.retireAge) < 0.02);
    return {
      key,
      name: meta[key].name,
      note: meta[key].note,
      nominal: input.avg,
      real: realAnnual(input.avg, input.inflation),
      points,
      nest: nestPt ? nestPt.balance : atPercent(nests, pct[key]),
      depletedAge,
      burn: burns[key],
      final: points[points.length - 1].balance,
    };
  });
}

function roundAge(age) {
  return Math.round(age * 1000) / 1000;
}
