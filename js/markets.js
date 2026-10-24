(function (root) {
  'use strict';

  // Nominal compound annual rates from the FHFA purchase-only house price index,
  // seasonally adjusted, 1991 Q1 (index = 100) through 2026 Q2. 35.25 years.
  // This is history, including the bust and the 2020-22 spike. It is not a forecast.
  // Cities are the FHFA top-100 metros and divisions, assigned to the first state in the name.
  var SPAN = { from: '1991Q1', to: '2026Q2', years: 35.25 };

  var STATES = {
    AK: { name: 'Alaska', rate: 4.07 },
    AL: { name: 'Alabama', rate: 3.83 },
    AR: { name: 'Arkansas', rate: 3.78 },
    AZ: { name: 'Arizona', rate: 5.03 },
    CA: { name: 'California', rate: 4.14 },
    CO: { name: 'Colorado', rate: 5.56 },
    CT: { name: 'Connecticut', rate: 3.35 },
    DC: { name: 'District of Columbia', rate: 5.24 },
    DE: { name: 'Delaware', rate: 3.60 },
    FL: { name: 'Florida', rate: 4.94 },
    GA: { name: 'Georgia', rate: 4.19 },
    HI: { name: 'Hawaii', rate: 4.16 },
    IA: { name: 'Iowa', rate: 3.86 },
    ID: { name: 'Idaho', rate: 5.48 },
    IL: { name: 'Illinois', rate: 3.48 },
    IN: { name: 'Indiana', rate: 3.81 },
    KS: { name: 'Kansas', rate: 4.12 },
    KY: { name: 'Kentucky', rate: 4.08 },
    LA: { name: 'Louisiana', rate: 3.76 },
    MA: { name: 'Massachusetts', rate: 4.57 },
    MD: { name: 'Maryland', rate: 3.77 },
    ME: { name: 'Maine', rate: 4.64 },
    MI: { name: 'Michigan', rate: 3.96 },
    MN: { name: 'Minnesota', rate: 4.26 },
    MO: { name: 'Missouri', rate: 4.08 },
    MS: { name: 'Mississippi', rate: 3.43 },
    MT: { name: 'Montana', rate: 5.85 },
    NC: { name: 'North Carolina', rate: 4.29 },
    ND: { name: 'North Dakota', rate: 4.44 },
    NE: { name: 'Nebraska', rate: 4.27 },
    NH: { name: 'New Hampshire', rate: 4.58 },
    NJ: { name: 'New Jersey', rate: 4.31 },
    NM: { name: 'New Mexico', rate: 4.07 },
    NV: { name: 'Nevada', rate: 4.24 },
    NY: { name: 'New York', rate: 4.22 },
    OH: { name: 'Ohio', rate: 3.69 },
    OK: { name: 'Oklahoma', rate: 3.88 },
    OR: { name: 'Oregon', rate: 5.36 },
    PA: { name: 'Pennsylvania', rate: 3.85 },
    RI: { name: 'Rhode Island', rate: 4.30 },
    SC: { name: 'South Carolina', rate: 4.36 },
    SD: { name: 'South Dakota', rate: 4.66 },
    TN: { name: 'Tennessee', rate: 4.55 },
    TX: { name: 'Texas', rate: 4.32 },
    UT: { name: 'Utah', rate: 5.78 },
    VA: { name: 'Virginia', rate: 4.23 },
    VT: { name: 'Vermont', rate: 4.38 },
    WA: { name: 'Washington', rate: 5.13 },
    WI: { name: 'Wisconsin', rate: 4.51 },
    WV: { name: 'West Virginia', rate: 3.58 },
    WY: { name: 'Wyoming', rate: 5.03 },
    US: { name: 'United States', rate: 4.26 }
  };

  var CITIES = {
    AL: [
      { id: '13820', name: 'Birmingham', rate: 3.99, fhfa: 'Birmingham, AL' },
    ],
    AR: [
      { id: '30780', name: 'Little Rock', rate: 3.46, fhfa: 'Little Rock-North Little Rock-Conway, AR' },
    ],
    AZ: [
      { id: '38060', name: 'Phoenix', rate: 5.32, fhfa: 'Phoenix-Mesa-Chandler, AZ' },
      { id: '46060', name: 'Tucson', rate: 4.48, fhfa: 'Tucson, AZ' },
    ],
    CA: [
      { id: '12540', name: 'Bakersfield', rate: 3.36, fhfa: 'Bakersfield-Delano, CA' },
      { id: '23420', name: 'Fresno', rate: 3.88, fhfa: 'Fresno, CA' },
      { id: '40140', name: 'Inland Empire', rate: 4.07, fhfa: 'Riverside-San Bernardino-Ontario, CA' },
      { id: '31084', name: 'Los Angeles', rate: 4.33, fhfa: 'Los Angeles-Long Beach-Glendale, CA (MSAD)' },
      { id: '36084', name: 'Oakland', rate: 4.40, fhfa: 'Oakland-Fremont-Berkeley, CA (MSAD)' },
      { id: '11244', name: 'Orange County', rate: 4.84, fhfa: 'Anaheim-Santa Ana-Irvine, CA (MSAD)' },
      { id: '40900', name: 'Sacramento', rate: 3.68, fhfa: 'Sacramento-Roseville-Folsom, CA' },
      { id: '41740', name: 'San Diego', rate: 4.87, fhfa: 'San Diego-Chula Vista-Carlsbad, CA' },
      { id: '41884', name: 'San Francisco', rate: 4.76, fhfa: 'San Francisco-San Mateo-Redwood City, CA (MSAD)' },
      { id: '41940', name: 'San Jose', rate: 4.91, fhfa: 'San Jose-Sunnyvale-Santa Clara, CA' },
      { id: '44700', name: 'Stockton', rate: 3.59, fhfa: 'Stockton-Lodi, CA' },
      { id: '37100', name: 'Ventura', rate: 4.14, fhfa: 'Oxnard-Thousand Oaks-Ventura, CA' },
    ],
    CO: [
      { id: '17820', name: 'Colorado Springs', rate: 5.00, fhfa: 'Colorado Springs, CO' },
      { id: '19740', name: 'Denver', rate: 5.71, fhfa: 'Denver-Aurora-Centennial, CO' },
    ],
    CT: [
      { id: '25540', name: 'Hartford', rate: 3.03, fhfa: 'Hartford-West Hartford-East Hartford, CT' },
      { id: '14860', name: 'Stamford', rate: 3.78, fhfa: 'Bridgeport-Stamford-Danbury, CT' },
    ],
    DC: [
      { id: '47764', name: 'Washington', rate: 4.10, fhfa: 'Washington, DC-MD (MSAD)' },
    ],
    DE: [
      { id: '48864', name: 'Wilmington', rate: 3.51, fhfa: 'Wilmington, DE-MD-NJ (MSAD)' },
    ],
    FL: [
      { id: '22744', name: 'Fort Lauderdale', rate: 5.18, fhfa: 'Fort Lauderdale-Pompano Beach-Sunrise, FL (MSAD)' },
      { id: '15980', name: 'Fort Myers', rate: 4.19, fhfa: 'Cape Coral-Fort Myers, FL' },
      { id: '27260', name: 'Jacksonville', rate: 4.80, fhfa: 'Jacksonville, FL' },
      { id: '29460', name: 'Lakeland', rate: 4.50, fhfa: 'Lakeland-Winter Haven, FL' },
      { id: '33124', name: 'Miami', rate: 6.07, fhfa: 'Miami-Miami Beach-Kendall, FL (MSAD)' },
      { id: '36740', name: 'Orlando', rate: 4.56, fhfa: 'Orlando-Kissimmee-Sanford, FL' },
      { id: '35840', name: 'Sarasota', rate: 4.91, fhfa: 'North Port-Bradenton-Sarasota, FL' },
      { id: '41304', name: 'St. Petersburg', rate: 5.54, fhfa: 'St. Petersburg-Clearwater-Largo, FL (MSAD)' },
      { id: '45294', name: 'Tampa', rate: 4.99, fhfa: 'Tampa, FL (MSAD)' },
      { id: '48424', name: 'West Palm Beach', rate: 5.32, fhfa: 'West Palm Beach-Boca Raton-Delray Beach, FL (MSAD)' },
    ],
    GA: [
      { id: '12054', name: 'Atlanta', rate: 4.19, fhfa: 'Atlanta-Sandy Springs-Roswell, GA (MSAD)' },
      { id: '31924', name: 'Marietta', rate: 4.41, fhfa: 'Marietta, GA (MSAD)' },
    ],
    IA: [
      { id: '19780', name: 'Des Moines', rate: 3.73, fhfa: 'Des Moines-West Des Moines, IA' },
    ],
    ID: [
      { id: '14260', name: 'Boise', rate: 5.80, fhfa: 'Boise City, ID' },
    ],
    IL: [
      { id: '16984', name: 'Chicago', rate: 3.63, fhfa: 'Chicago-Naperville-Schaumburg, IL (MSAD)' },
      { id: '20994', name: 'Elgin', rate: 3.29, fhfa: 'Elgin, IL (MSAD)' },
    ],
    IN: [
      { id: '26900', name: 'Indianapolis', rate: 3.80, fhfa: 'Indianapolis-Carmel-Greenwood, IN' },
    ],
    KS: [
      { id: '28140', name: 'Kansas City', rate: 4.30, fhfa: 'Kansas City, MO-KS' },
    ],
    KY: [
      { id: '31140', name: 'Louisville', rate: 4.18, fhfa: 'Louisville/Jefferson County, KY-IN' },
    ],
    LA: [
      { id: '12940', name: 'Baton Rouge', rate: 3.72, fhfa: 'Baton Rouge, LA' },
      { id: '35380', name: 'New Orleans', rate: 4.20, fhfa: 'New Orleans-Metairie, LA' },
    ],
    MA: [
      { id: '14454', name: 'Boston', rate: 4.78, fhfa: 'Boston, MA (MSAD)' },
      { id: '15764', name: 'Cambridge', rate: 4.76, fhfa: 'Cambridge-Newton-Framingham, MA (MSAD)' },
      { id: '49340', name: 'Worcester', rate: 4.14, fhfa: 'Worcester, MA' },
    ],
    MD: [
      { id: '12580', name: 'Baltimore', rate: 3.82, fhfa: 'Baltimore-Columbia-Towson, MD' },
      { id: '23224', name: 'Bethesda', rate: 3.85, fhfa: 'Frederick-Gaithersburg-Bethesda, MD (MSAD)' },
    ],
    MI: [
      { id: '19804', name: 'Detroit', rate: 3.68, fhfa: 'Detroit-Dearborn-Livonia, MI (MSAD)' },
      { id: '47664', name: 'Detroit suburbs', rate: 3.77, fhfa: 'Warren-Troy-Farmington Hills, MI (MSAD)' },
      { id: '24340', name: 'Grand Rapids', rate: 4.42, fhfa: 'Grand Rapids-Wyoming-Kentwood, MI' },
    ],
    MN: [
      { id: '33460', name: 'Minneapolis', rate: 4.22, fhfa: 'Minneapolis-St. Paul-Bloomington, MN-WI' },
    ],
    MO: [
      { id: '28140', name: 'Kansas City', rate: 4.30, fhfa: 'Kansas City, MO-KS' },
      { id: '41180', name: 'St. Louis', rate: 3.88, fhfa: 'St. Louis, MO-IL' },
    ],
    NC: [
      { id: '16740', name: 'Charlotte', rate: 4.51, fhfa: 'Charlotte-Concord-Gastonia, NC-SC' },
      { id: '24660', name: 'Greensboro', rate: 3.60, fhfa: 'Greensboro-High Point, NC' },
      { id: '39580', name: 'Raleigh', rate: 4.42, fhfa: 'Raleigh-Cary, NC' },
    ],
    NE: [
      { id: '36540', name: 'Omaha', rate: 4.23, fhfa: 'Omaha, NE-IA' },
    ],
    NJ: [
      { id: '15804', name: 'Camden', rate: 3.85, fhfa: 'Camden, NJ (MSAD)' },
      { id: '29484', name: 'Central Jersey', rate: 4.51, fhfa: 'Lakewood-New Brunswick, NJ (MSAD)' },
      { id: '35084', name: 'Newark', rate: 4.37, fhfa: 'Newark, NJ (MSAD)' },
    ],
    NM: [
      { id: '10740', name: 'Albuquerque', rate: 4.04, fhfa: 'Albuquerque, NM' },
    ],
    NV: [
      { id: '29820', name: 'Las Vegas', rate: 4.01, fhfa: 'Las Vegas-Henderson-North Las Vegas, NV' },
    ],
    NY: [
      { id: '10580', name: 'Albany', rate: 3.56, fhfa: 'Albany-Schenectady-Troy, NY' },
      { id: '15380', name: 'Buffalo', rate: 3.88, fhfa: 'Buffalo-Cheektowaga, NY' },
      { id: '35004', name: 'Long Island', rate: 4.78, fhfa: 'Nassau County-Suffolk County, NY (MSAD)' },
      { id: '35614', name: 'New York', rate: 4.48, fhfa: 'New York-Jersey City-White Plains, NY-NJ (MSAD)' },
      { id: '40380', name: 'Rochester', rate: 3.38, fhfa: 'Rochester, NY' },
    ],
    OH: [
      { id: '17140', name: 'Cincinnati', rate: 3.85, fhfa: 'Cincinnati, OH-KY-IN' },
      { id: '17410', name: 'Cleveland', rate: 3.43, fhfa: 'Cleveland, OH' },
      { id: '18140', name: 'Columbus', rate: 4.21, fhfa: 'Columbus, OH' },
      { id: '19430', name: 'Dayton', rate: 3.29, fhfa: 'Dayton-Kettering-Beavercreek, OH' },
    ],
    OK: [
      { id: '36420', name: 'Oklahoma City', rate: 4.03, fhfa: 'Oklahoma City, OK' },
      { id: '46140', name: 'Tulsa', rate: 3.93, fhfa: 'Tulsa, OK' },
    ],
    OR: [
      { id: '38900', name: 'Portland', rate: 5.37, fhfa: 'Portland-Vancouver-Hillsboro, OR-WA' },
    ],
    PA: [
      { id: '10900', name: 'Allentown', rate: 3.66, fhfa: 'Allentown-Bethlehem-Easton, PA-NJ' },
      { id: '37964', name: 'Philadelphia', rate: 4.21, fhfa: 'Philadelphia, PA (MSAD)' },
      { id: '33874', name: 'Philadelphia suburbs', rate: 3.88, fhfa: 'Montgomery County-Bucks County-Chester County, PA (MSAD)' },
      { id: '38300', name: 'Pittsburgh', rate: 3.98, fhfa: 'Pittsburgh, PA' },
    ],
    RI: [
      { id: '39300', name: 'Providence', rate: 4.32, fhfa: 'Providence-Warwick, RI-MA' },
    ],
    SC: [
      { id: '16700', name: 'Charleston', rate: 5.67, fhfa: 'Charleston-North Charleston, SC' },
      { id: '17900', name: 'Columbia', rate: 3.80, fhfa: 'Columbia, SC' },
      { id: '24860', name: 'Greenville', rate: 4.52, fhfa: 'Greenville-Anderson-Greer, SC' },
    ],
    TN: [
      { id: '28940', name: 'Knoxville', rate: 4.75, fhfa: 'Knoxville, TN' },
      { id: '32820', name: 'Memphis', rate: 3.32, fhfa: 'Memphis, TN-MS-AR' },
      { id: '34980', name: 'Nashville', rate: 5.17, fhfa: 'Nashville-Davidson--Murfreesboro--Franklin, TN' },
    ],
    TX: [
      { id: '12420', name: 'Austin', rate: 5.59, fhfa: 'Austin-Round Rock-San Marcos, TX' },
      { id: '19124', name: 'Dallas', rate: 4.33, fhfa: 'Dallas-Plano-Irving, TX (MSAD)' },
      { id: '21340', name: 'El Paso', rate: 3.65, fhfa: 'El Paso, TX' },
      { id: '23104', name: 'Fort Worth', rate: 4.20, fhfa: 'Fort Worth-Arlington-Grapevine, TX (MSAD)' },
      { id: '26420', name: 'Houston', rate: 4.24, fhfa: 'Houston-Pasadena-The Woodlands, TX' },
      { id: '41700', name: 'San Antonio', rate: 4.34, fhfa: 'San Antonio-New Braunfels, TX' },
    ],
    UT: [
      { id: '39340', name: 'Provo', rate: 5.58, fhfa: 'Provo-Orem-Lehi, UT' },
      { id: '41620', name: 'Salt Lake City', rate: 6.06, fhfa: 'Salt Lake City-Murray, UT' },
    ],
    VA: [
      { id: '11694', name: 'Northern Virginia', rate: 4.28, fhfa: 'Arlington-Alexandria-Reston, VA-WV (MSAD)' },
      { id: '40060', name: 'Richmond', rate: 4.34, fhfa: 'Richmond, VA' },
      { id: '47260', name: 'Virginia Beach', rate: 4.15, fhfa: 'Virginia Beach-Chesapeake-Norfolk, VA-NC' },
    ],
    WA: [
      { id: '21794', name: 'Everett', rate: 4.93, fhfa: 'Everett, WA (MSAD)' },
      { id: '42644', name: 'Seattle', rate: 5.32, fhfa: 'Seattle-Bellevue-Kent, WA (MSAD)' },
      { id: '45104', name: 'Tacoma', rate: 5.18, fhfa: 'Tacoma-Lakewood, WA (MSAD)' },
    ],
    WI: [
      { id: '33340', name: 'Milwaukee', rate: 4.43, fhfa: 'Milwaukee-Waukesha, WI' },
    ],
  };

  // Property-tax presets. The original list is unchanged. States that were not on it
  // use the Census ACS 2024 effective rate on owner-occupied homes. District of Columbia
  // has no preset, so picking it leaves the tax rate alone.
  var TAX = {
    CA: [{ id: 'CA', label: 'California, new purchase', rate: 1.10, growth: 'prop13' }, { id: 'CA-eff', label: 'California, statewide effective', rate: 0.71, growth: 'prop13' }],
    AK: [{ id: 'AK', label: 'Alaska', rate: 0.94, growth: 'market' }],
    AL: [{ id: 'AL', label: 'Alabama', rate: 0.37, growth: 'market' }],
    AR: [{ id: 'AR', label: 'Arkansas', rate: 0.56, growth: 'market' }],
    AZ: [{ id: 'AZ', label: 'Arizona', rate: 0.62, growth: 'market' }],
    CO: [{ id: 'CO', label: 'Colorado', rate: 0.55, growth: 'market' }],
    CT: [{ id: 'CT', label: 'Connecticut', rate: 1.78, growth: 'market' }],
    DC: [{ id: 'DC', label: 'District of Columbia', rate: null, growth: 'market' }],
    DE: [{ id: 'DE', label: 'Delaware', rate: 0.54, growth: 'market' }],
    FL: [{ id: 'FL', label: 'Florida', rate: 0.91, growth: 'market' }],
    GA: [{ id: 'GA', label: 'Georgia', rate: 0.79, growth: 'market' }],
    HI: [{ id: 'HI', label: 'Hawaii', rate: 0.27, growth: 'market' }],
    IA: [{ id: 'IA', label: 'Iowa', rate: 1.33, growth: 'market' }],
    ID: [{ id: 'ID', label: 'Idaho', rate: 0.50, growth: 'market' }],
    IL: [{ id: 'IL', label: 'Illinois', rate: 1.92, growth: 'market' }],
    IN: [{ id: 'IN', label: 'Indiana', rate: 0.76, growth: 'market' }],
    KS: [{ id: 'KS', label: 'Kansas', rate: 1.21, growth: 'market' }],
    KY: [{ id: 'KY', label: 'Kentucky', rate: 0.74, growth: 'market' }],
    LA: [{ id: 'LA', label: 'Louisiana', rate: 0.55, growth: 'market' }],
    MA: [{ id: 'MA', label: 'Massachusetts', rate: 1.14, growth: 'market' }],
    MD: [{ id: 'MD', label: 'Maryland', rate: 0.92, growth: 'market' }],
    ME: [{ id: 'ME', label: 'Maine', rate: 0.98, growth: 'market' }],
    MI: [{ id: 'MI', label: 'Michigan', rate: 1.19, growth: 'market' }],
    MN: [{ id: 'MN', label: 'Minnesota', rate: 1.00, growth: 'market' }],
    MO: [{ id: 'MO', label: 'Missouri', rate: 0.89, growth: 'market' }],
    MS: [{ id: 'MS', label: 'Mississippi', rate: 0.58, growth: 'market' }],
    MT: [{ id: 'MT', label: 'Montana', rate: 0.72, growth: 'market' }],
    NC: [{ id: 'NC', label: 'North Carolina', rate: 0.66, growth: 'market' }],
    ND: [{ id: 'ND', label: 'North Dakota', rate: 0.92, growth: 'market' }],
    NE: [{ id: 'NE', label: 'Nebraska', rate: 1.44, growth: 'market' }],
    NH: [{ id: 'NH', label: 'New Hampshire', rate: 1.50, growth: 'market' }],
    NJ: [{ id: 'NJ', label: 'New Jersey', rate: 2.23, growth: 'market' }],
    NM: [{ id: 'NM', label: 'New Mexico', rate: 0.70, growth: 'market' }],
    NV: [{ id: 'NV', label: 'Nevada', rate: 0.50, growth: 'market' }],
    NY: [{ id: 'NY', label: 'New York', rate: 1.46, growth: 'market' }],
    OH: [{ id: 'OH', label: 'Ohio', rate: 1.36, growth: 'market' }],
    OK: [{ id: 'OK', label: 'Oklahoma', rate: 0.79, growth: 'market' }],
    OR: [{ id: 'OR', label: 'Oregon', rate: 0.81, growth: 'market' }],
    PA: [{ id: 'PA', label: 'Pennsylvania', rate: 1.26, growth: 'market' }],
    RI: [{ id: 'RI', label: 'Rhode Island', rate: 1.12, growth: 'market' }],
    SC: [{ id: 'SC', label: 'South Carolina', rate: 0.49, growth: 'market' }],
    SD: [{ id: 'SD', label: 'South Dakota', rate: 1.00, growth: 'market' }],
    TN: [{ id: 'TN', label: 'Tennessee', rate: 0.52, growth: 'market' }],
    TX: [{ id: 'TX', label: 'Texas', rate: 1.68, growth: 'market' }],
    UT: [{ id: 'UT', label: 'Utah', rate: 0.48, growth: 'market' }],
    VA: [{ id: 'VA', label: 'Virginia', rate: 0.78, growth: 'market' }],
    VT: [{ id: 'VT', label: 'Vermont', rate: 1.51, growth: 'market' }],
    WA: [{ id: 'WA', label: 'Washington', rate: 0.84, growth: 'market' }],
    WI: [{ id: 'WI', label: 'Wisconsin', rate: 1.32, growth: 'market' }],
    WV: [{ id: 'WV', label: 'West Virginia', rate: 0.51, growth: 'market' }],
    WY: [{ id: 'WY', label: 'Wyoming', rate: 0.53, growth: 'market' }],
    US: [{ id: 'US', label: 'U.S. median', rate: 1.02, growth: 'market' }],
  };

  function options() {
    var list = TAX.CA.slice();
    var codes = Object.keys(STATES).filter(function (code) { return code !== 'CA' && code !== 'US'; });
    codes.sort(function (a, b) { return STATES[a].name < STATES[b].name ? -1 : 1; });
    codes.forEach(function (code) { TAX[code].forEach(function (row) { list.push(row); }); });
    TAX.US.forEach(function (row) { list.push(row); });
    return list.map(function (row) {
      var market = row.id.indexOf('CA') === 0 ? 'CA' : row.id;
      return { id: row.id, label: row.label, taxRate: row.rate, taxGrowth: row.growth, market: market };
    });
  }

  function cities(code) {
    return CITIES[code] ? CITIES[code].slice() : [];
  }

  function place(code, cityId) {
    var state = STATES[code];
    if (!state) return null;
    var list = CITIES[code] || [];
    var i;
    if (cityId) {
      for (i = 0; i < list.length; i++) {
        if (list[i].id === cityId) {
          return { kind: 'city', rate: list[i].rate, city: list[i], state: state, code: code };
        }
      }
    }
    return { kind: 'state', rate: state.rate, city: null, state: state, code: code };
  }

  root.HomeMarkets = {
    SPAN: SPAN,
    STATES: STATES,
    CITIES: CITIES,
    options: options,
    cities: cities,
    place: place
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
