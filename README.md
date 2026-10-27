# finance-calculator

A fixed-rate home loan payment and a month-by-month rent-versus-buy comparison, with the formulas on the page.

The Retire tab carries a balance from a chosen age to a chosen end, at an average stock return, a below-average one, and a much lower one. The spending knob is what you keep after federal and California tax. It estimates the after-tax spending that still lasts. The math is in `js/retirement-model.js`.

Live site: [https://rhianc.github.io/finance-calculator/](https://rhianc.github.io/finance-calculator/)

Open `index.html` in a browser, or serve the folder so the stylesheet and scripts load:

```bash
python3 -m http.server 8765
```

Then visit `http://127.0.0.1:8765/`.

The calculation lives in `js/model.js`. Check it with JavaScriptCore:

```bash
jsc test/model.test.js
```

Federal brackets, the standard deduction, and the long-term gain bands follow tax year 2026. Household income sets the federal bracket, the state bracket for the selected state, the state income tax that uses up the SALT cap, and the tax on a sale, including the 3.8% net investment income tax. The SALT cap returns to $10,000 in 2030. Home appreciation starts from the FHFA purchase-only house price index, seasonally adjusted, compounded from 1991 Q1 through 2026 Q2 for the selected state and for major metros in that state. Insurance starts from the Insurify average premium for $300,000 of dwelling coverage and a $1,000 deductible, as of October 21, 2026, scaled to the home price. Flood is not included. Appreciation and insurance fill in when the state or city changes. Insurance also refills when the price changes. State income tax refills when income, filing status, or the state changes. Any of them can be edited. The page states the assumptions and what it leaves out.
