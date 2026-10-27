// Steady real-dollar retirement paths. Spend is after-tax.
// Not a sequence-of-returns model, and not a full tax return.

export const DEFAULTS = {
  age: 28,
  retireAge: 65,
  endAge: 90,
  balance: 50000,
  annualSave: 20000,
  annualSpend: 70000,
  ssAnnual: 24000,
  ssAge: 67,
  inflationPct: 2.5,
  avgPct: 10,
  belowPct: 7,
  badPct: 4,
  account: "traditional",
  filing: "single",
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
    annualSave: clamp(num(raw.annualSave, DEFAULTS.annualSave), 0, 2000000),
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
  for (let i = 0; i < 48; i++) {
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

/**
 * Monthly, in today's dollars.
 * Working months: grow, then add that month's savings.
 * Retired months: withdraw the pre-tax amount at the start, then grow.
 * The withdrawal is sized so spending on the knob is what remains after tax.
 * Social Security begins at the later of claim age and retirement.
 */
export function simulate(input, nominal) {
  const real = realAnnual(nominal, input.inflation);
  const rm = Math.pow(1 + real, 1 / 12) - 1;
  const months = Math.max(1, Math.round((input.endAge - input.age) * 12));
  const retireM = Math.max(0, Math.round((input.retireAge - input.age) * 12));
  const claimM = Math.max(retireM, Math.round((input.ssAge - input.age) * 12));
  let bal = input.balance;
  let nest = input.balance;
  let depletedAge = null;
  const points = [{ age: input.age, balance: bal }];
  const monthWithdraw = new Array(months + 1).fill(0);
  const monthSurplus = new Array(months + 1).fill(0);

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

  for (let m = 1; m <= months; m++) {
    if (m <= retireM) {
      bal = bal * (1 + rm) + input.annualSave / 12;
      if (m === retireM) nest = bal;
    } else {
      const withdraw = monthWithdraw[m];
      bal -= withdraw;
      if (bal <= 0.5 && withdraw > 0.5) {
        bal = 0;
        if (depletedAge == null) depletedAge = input.age + (m - 1) / 12;
      }
      bal = Math.max(0, bal) * (1 + rm) + monthSurplus[m];
    }
    if (m % 12 === 0 || m === months || m === retireM) {
      points.push({ age: roundAge(input.age + m / 12), balance: Math.max(0, bal) });
    }
  }

  if (retireM === 0) nest = input.balance;
  return {
    points,
    nest,
    depletedAge,
    final: Math.max(0, bal),
    real,
  };
}

function roundAge(age) {
  return Math.round(age * 1000) / 1000;
}

export function lasts(input, nominal, spend) {
  const sim = simulate({ ...input, annualSpend: spend }, nominal);
  return sim.depletedAge == null;
}

/** Largest constant real after-tax spending (rounded down to $100) that never hits zero. */
export function sustainableSpend(input, nominal) {
  if (!lasts(input, nominal, 0)) return 0;
  let lo = 0;
  let hi = 100000;
  while (lasts(input, nominal, hi) && hi < 20000000) hi *= 2;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (lasts(input, nominal, mid)) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo / 100) * 100;
}

export function project(input) {
  const paths = [
    { key: "avg", name: "Average", nominal: input.avg },
    { key: "below", name: "Below average", nominal: input.below },
    { key: "bad", name: "A lot below", nominal: input.bad },
  ];
  return paths.map((path) => {
    const sim = simulate(input, path.nominal);
    return {
      ...path,
      ...sim,
      burn: sustainableSpend(input, path.nominal),
    };
  });
}
