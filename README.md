# finance-calculator

A fixed-rate home loan payment and a month-by-month rent-versus-buy comparison, with the formulas on the page.

The Retire tab carries a balance from a chosen age to a chosen end. Each year is a real S&P 500 year, redrawn in stretches, and the lines are the median, the lower quarter, and the lower tenth. The spending knob is what you keep after federal and California tax. The headline number is the spend that lasted in 9 out of 10 of those markets. The math is in `js/retirement-model.js`.

Live site: [https://rhianc.github.io/finance-calculator/](https://rhianc.github.io/finance-calculator/)

Open `index.html` in a browser, or serve the folder so the stylesheet and scripts load:

```bash
python3 -m http.server 8765
```

Then visit `http://127.0.0.1:8765/`.

The calculation lives in `js/model.js`. Check it with JavaScriptCore:

```bash
jsc test/model.test.js
jsc -m test/retirement.test.mjs
```

On macOS `jsc` lives at `/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc`.

The stock return is an expected (average) yearly return, 9% by default: 4% T-bills plus a 5% equity premium. Wealth multiplies, so a typical path compounds below that. The housing pages compound the stocks at (1+μ)e^(−σ²/2) − 1 with 16% volatility, then take off a 0.4% dividend-tax drag. The Retire page shows both the average and the compound real return of its shifted history. Every stock account is taxed on its gain when the comparison sells it, the same as the house. Rent has its own growth rate, which defaults to the home's appreciation so price-to-rent holds.

Federal brackets, the standard deduction, and the long-term gain bands follow tax year 2026. Household income sets the federal bracket, the state bracket for the selected state, the state income tax that uses up the SALT cap, and the tax on a sale, including the 3.8% net investment income tax. The SALT cap returns to $10,000 in 2030. Home appreciation starts from the FHFA purchase-only house price index, seasonally adjusted, compounded from 1991 Q1 through 2026 Q2 for the selected state and for major metros in that state. Insurance starts from the Insurify average premium for $300,000 of dwelling coverage and a $1,000 deductible, as of October 21, 2026, scaled to the home price. Flood is not included. Appreciation and insurance fill in when the state or city changes. Insurance also refills when the price changes. State income tax refills when income, filing status, or the state changes. Any of them can be edited. The page states the assumptions and what it leaves out.
