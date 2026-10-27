// Steady real-dollar retirement paths. Not a tax or sequence-of-returns model.

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
};

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
  };
}

function num(v, fallback) {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Monthly, in today's dollars.
 * Working months: grow, then add that month's savings.
 * Retired months: withdraw the gap after Social Security at the start, then grow.
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

  for (let m = 1; m <= months; m++) {
    if (m <= retireM) {
      bal = bal * (1 + rm) + input.annualSave / 12;
      if (m === retireM) nest = bal;
    } else {
      const ss = m >= claimM ? input.ssAnnual / 12 : 0;
      const withdraw = Math.max(0, input.annualSpend / 12 - ss);
      const surplus = Math.max(0, ss - input.annualSpend / 12);
      bal -= withdraw;
      if (bal <= 0.5) {
        bal = 0;
        if (depletedAge == null) depletedAge = input.age + (m - 1) / 12;
      }
      bal = bal * (1 + rm) + surplus;
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

/** Largest constant real spending (rounded down to $100) that never hits zero. */
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
