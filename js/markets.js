(function (root) {
  'use strict';

  // Nominal compound annual rates from the FHFA purchase-only house price index,
  // seasonally adjusted, 1991 Q1 (index = 100) through 2026 Q2. 35.25 years.
  // This is history, including the bust and the 2020-22 spike. It is not a forecast.
  // Cities are the FHFA top-100 metros and divisions, assigned to the first state in the name.
  // ins is the Insurify average annual homeowners premium for $300,000 of dwelling
  // coverage and a $1,000 deductible, as of October 21, 2026. Flood is not included.
  // A published city figure replaces the state figure. Ventura uses the Oxnard figure.
  var DWELLING = 300000;
  var SPAN = { from: '1991Q1', to: '2026Q2', years: 35.25 };

  var STATES = {
    AK: { name: 'Alaska', rate: 4.07 , ins: 1320 },
    AL: { name: 'Alabama', rate: 3.83 , ins: 3408 },
    AR: { name: 'Arkansas', rate: 3.78 , ins: 3552 },
    AZ: { name: 'Arizona', rate: 5.03 , ins: 2184 },
    CA: { name: 'California', rate: 4.14 , ins: 2040 },
    CO: { name: 'Colorado', rate: 5.56 , ins: 3240 },
    CT: { name: 'Connecticut', rate: 3.35 , ins: 1980 },
    DC: { name: 'District of Columbia', rate: 5.24 , ins: 1200 },
    DE: { name: 'Delaware', rate: 3.60 , ins: 1272 },
    FL: { name: 'Florida', rate: 4.94 , ins: 6408 },
    GA: { name: 'Georgia', rate: 4.19 , ins: 2496 },
    HI: { name: 'Hawaii', rate: 4.16 , ins: 1488 },
    IA: { name: 'Iowa', rate: 3.86 , ins: 2508 },
    ID: { name: 'Idaho', rate: 5.48 , ins: 1728 },
    IL: { name: 'Illinois', rate: 3.48 , ins: 2568 },
    IN: { name: 'Indiana', rate: 3.81 , ins: 2220 },
    KS: { name: 'Kansas', rate: 4.12 , ins: 3996 },
    KY: { name: 'Kentucky', rate: 4.08 , ins: 3252 },
    LA: { name: 'Louisiana', rate: 3.76 , ins: 5028 },
    MA: { name: 'Massachusetts', rate: 4.57 , ins: 1956 },
    MD: { name: 'Maryland', rate: 3.77 , ins: 1944 },
    ME: { name: 'Maine', rate: 4.64 , ins: 1200 },
    MI: { name: 'Michigan', rate: 3.96 , ins: 2256 },
    MN: { name: 'Minnesota', rate: 4.26 , ins: 2676 },
    MO: { name: 'Missouri', rate: 4.08 , ins: 2904 },
    MS: { name: 'Mississippi', rate: 3.43 , ins: 3348 },
    MT: { name: 'Montana', rate: 5.85 , ins: 2664 },
    NC: { name: 'North Carolina', rate: 4.29 , ins: 3192 },
    ND: { name: 'North Dakota', rate: 4.44 , ins: 2664 },
    NE: { name: 'Nebraska', rate: 4.27 , ins: 4044 },
    NH: { name: 'New Hampshire', rate: 4.58 , ins: 1188 },
    NJ: { name: 'New Jersey', rate: 4.31 , ins: 1224 },
    NM: { name: 'New Mexico', rate: 4.07 , ins: 3264 },
    NV: { name: 'Nevada', rate: 4.24 , ins: 1308 },
    NY: { name: 'New York', rate: 4.22 , ins: 1356 },
    OH: { name: 'Ohio', rate: 3.69 , ins: 1716 },
    OK: { name: 'Oklahoma', rate: 3.88 , ins: 5556 },
    OR: { name: 'Oregon', rate: 5.36 , ins: 1320 },
    PA: { name: 'Pennsylvania', rate: 3.85 , ins: 1272 },
    RI: { name: 'Rhode Island', rate: 4.30 , ins: 2364 },
    SC: { name: 'South Carolina', rate: 4.36 , ins: 2700 },
    SD: { name: 'South Dakota', rate: 4.66 , ins: 2736 },
    TN: { name: 'Tennessee', rate: 4.55 , ins: 3096 },
    TX: { name: 'Texas', rate: 4.32 , ins: 4668 },
    UT: { name: 'Utah', rate: 5.78 , ins: 1524 },
    VA: { name: 'Virginia', rate: 4.23 , ins: 1656 },
    VT: { name: 'Vermont', rate: 4.38 , ins: 984 },
    WA: { name: 'Washington', rate: 5.13 , ins: 1404 },
    WI: { name: 'Wisconsin', rate: 4.51 , ins: 1512 },
    WV: { name: 'West Virginia', rate: 3.58 , ins: 1536 },
    WY: { name: 'Wyoming', rate: 5.03 , ins: 1704 },
    US: { name: 'United States', rate: 4.26 , ins: 2808 }
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
      { id: '12540', name: 'Bakersfield', rate: 3.36, ins: 1824, fhfa: 'Bakersfield-Delano, CA' },
      { id: '23420', name: 'Fresno', rate: 3.88, ins: 2028, fhfa: 'Fresno, CA' },
      { id: '40140', name: 'Inland Empire', rate: 4.07, ins: 2196, fhfa: 'Riverside-San Bernardino-Ontario, CA' },
      { id: '31084', name: 'Los Angeles', rate: 4.33, ins: 2400, fhfa: 'Los Angeles-Long Beach-Glendale, CA (MSAD)' },
      { id: '36084', name: 'Oakland', rate: 4.40, fhfa: 'Oakland-Fremont-Berkeley, CA (MSAD)' },
      { id: '11244', name: 'Orange County', rate: 4.84, fhfa: 'Anaheim-Santa Ana-Irvine, CA (MSAD)' },
      { id: '40900', name: 'Sacramento', rate: 3.68, ins: 1788, fhfa: 'Sacramento-Roseville-Folsom, CA' },
      { id: '41740', name: 'San Diego', rate: 4.87, ins: 1896, fhfa: 'San Diego-Chula Vista-Carlsbad, CA' },
      { id: '41884', name: 'San Francisco', rate: 4.76, ins: 1812, fhfa: 'San Francisco-San Mateo-Redwood City, CA (MSAD)' },
      { id: '41940', name: 'San Jose', rate: 4.91, ins: 1632, fhfa: 'San Jose-Sunnyvale-Santa Clara, CA' },
      { id: '44700', name: 'Stockton', rate: 3.59, ins: 1824, fhfa: 'Stockton-Lodi, CA' },
      { id: '37100', name: 'Ventura', rate: 4.14, ins: 1920, fhfa: 'Oxnard-Thousand Oaks-Ventura, CA' },
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
      { id: '15980', name: 'Fort Myers', rate: 4.19, ins: 8688, fhfa: 'Cape Coral-Fort Myers, FL' },
      { id: '27260', name: 'Jacksonville', rate: 4.80, ins: 4020, fhfa: 'Jacksonville, FL' },
      { id: '29460', name: 'Lakeland', rate: 4.50, fhfa: 'Lakeland-Winter Haven, FL' },
      { id: '33124', name: 'Miami', rate: 6.07, ins: 15360, fhfa: 'Miami-Miami Beach-Kendall, FL (MSAD)' },
      { id: '36740', name: 'Orlando', rate: 4.56, ins: 5256, fhfa: 'Orlando-Kissimmee-Sanford, FL' },
      { id: '35840', name: 'Sarasota', rate: 4.91, fhfa: 'North Port-Bradenton-Sarasota, FL' },
      { id: '41304', name: 'St. Petersburg', rate: 5.54, fhfa: 'St. Petersburg-Clearwater-Largo, FL (MSAD)' },
      { id: '45294', name: 'Tampa', rate: 4.99, ins: 6180, fhfa: 'Tampa, FL (MSAD)' },
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
      { id: '12940', name: 'Baton Rouge', rate: 3.72, ins: 4764, fhfa: 'Baton Rouge, LA' },
      { id: '35380', name: 'New Orleans', rate: 4.20, ins: 8388, fhfa: 'New Orleans-Metairie, LA' },
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
      { id: '36420', name: 'Oklahoma City', rate: 4.03, ins: 6228, fhfa: 'Oklahoma City, OK' },
      { id: '46140', name: 'Tulsa', rate: 3.93, ins: 4980, fhfa: 'Tulsa, OK' },
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
      { id: '12420', name: 'Austin', rate: 5.59, ins: 3180, fhfa: 'Austin-Round Rock-San Marcos, TX' },
      { id: '19124', name: 'Dallas', rate: 4.33, ins: 5148, fhfa: 'Dallas-Plano-Irving, TX (MSAD)' },
      { id: '21340', name: 'El Paso', rate: 3.65, ins: 2280, fhfa: 'El Paso, TX' },
      { id: '23104', name: 'Fort Worth', rate: 4.20, fhfa: 'Fort Worth-Arlington-Grapevine, TX (MSAD)' },
      { id: '26420', name: 'Houston', rate: 4.24, ins: 6084, fhfa: 'Houston-Pasadena-The Woodlands, TX' },
      { id: '41700', name: 'San Antonio', rate: 4.34, ins: 3576, fhfa: 'San Antonio-New Braunfels, TX' },
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

  // Gross yield (annual rent / value) at a typical price. Zillow ZHVI and ZORI, May 2026.
  // A house priced away from that typical value does not keep the same yield:
  // the rental page raises rent with price^0.85.
  var RENT = {
    US: { y: 0.0632, anchor: 370320 },
    AK: { y: 0.055, anchor: 380000 },
    AL: { y: 0.0662, anchor: 262556 },
    AR: { y: 0.0647, anchor: 231039 },
    AZ: { y: 0.0490, anchor: 396000 },
    CA: { y: 0.0440, anchor: 740000 },
    CO: { y: 0.0432, anchor: 515000 },
    CT: { y: 0.0520, anchor: 450000 },
    DC: { y: 0.0497, anchor: 583013 },
    DE: { y: 0.055, anchor: 400000 },
    FL: { y: 0.0630, anchor: 400000 },
    GA: { y: 0.0577, anchor: 382938 },
    HI: { y: 0.0420, anchor: 851163 },
    IA: { y: 0.0524, anchor: 296070 },
    ID: { y: 0.0444, anchor: 496288 },
    IL: { y: 0.0768, anchor: 353998 },
    IN: { y: 0.0630, anchor: 295921 },
    KS: { y: 0.0564, anchor: 329641 },
    KY: { y: 0.0587, anchor: 283232 },
    LA: { y: 0.0680, anchor: 250000 },
    MA: { y: 0.0519, anchor: 741868 },
    MD: { y: 0.0567, anchor: 405877 },
    ME: { y: 0.050, anchor: 400000 },
    MI: { y: 0.0605, anchor: 314000 },
    MN: { y: 0.0524, anchor: 393774 },
    MO: { y: 0.0597, anchor: 303000 },
    MS: { y: 0.0829, anchor: 215622 },
    MT: { y: 0.048, anchor: 450000 },
    NC: { y: 0.0500, anchor: 414000 },
    ND: { y: 0.060, anchor: 280000 },
    NE: { y: 0.0558, anchor: 310337 },
    NH: { y: 0.048, anchor: 480000 },
    NJ: { y: 0.052, anchor: 550000 },
    NM: { y: 0.0511, anchor: 352894 },
    NV: { y: 0.0484, anchor: 430650 },
    NY: { y: 0.0550, anchor: 500000 },
    OH: { y: 0.0617, anchor: 299000 },
    OK: { y: 0.0680, anchor: 246872 },
    OR: { y: 0.0391, anchor: 552022 },
    PA: { y: 0.0650, anchor: 310000 },
    RI: { y: 0.0494, anchor: 524867 },
    SC: { y: 0.0620, anchor: 320000 },
    SD: { y: 0.060, anchor: 300000 },
    TN: { y: 0.0587, anchor: 352000 },
    TX: { y: 0.0580, anchor: 340000 },
    UT: { y: 0.0370, anchor: 550000 },
    VA: { y: 0.0530, anchor: 420000 },
    VT: { y: 0.050, anchor: 380000 },
    WA: { y: 0.0400, anchor: 600000 },
    WI: { y: 0.0473, anchor: 390238 },
    WV: { y: 0.070, anchor: 180000 },
    WY: { y: 0.052, anchor: 360000 }
  };

  var CITY_RENT = {
    '13820': { y: 0.0662, anchor: 262556 },
    '30780': { y: 0.0647, anchor: 231039 },
    '38060': { y: 0.0466, anchor: 448352 },
    '46060': { y: 0.0514, anchor: 343580 },
    '12540': { y: 0.0589, anchor: 364264 },
    '23420': { y: 0.0591, anchor: 409749 },
    '40140': { y: 0.0516, anchor: 585378 },
    '31084': { y: 0.0360, anchor: 968608 },
    '40900': { y: 0.0470, anchor: 582707 },
    '41740': { y: 0.0374, anchor: 946365 },
    '41884': { y: 0.0340, anchor: 1149215 },
    '41940': { y: 0.0270, anchor: 1610466 },
    '44700': { y: 0.0546, anchor: 531785 },
    '17820': { y: 0.0464, anchor: 457300 },
    '19740': { y: 0.0400, anchor: 573221 },
    '25540': { y: 0.0592, anchor: 400167 },
    '47764': { y: 0.0497, anchor: 583013 },
    '33124': { y: 0.0680, anchor: 475622 },
    '27260': { y: 0.0578, anchor: 352994 },
    '29460': { y: 0.0742, anchor: 298822 },
    '36740': { y: 0.0612, anchor: 387733 },
    '45294': { y: 0.0671, anchor: 360738 },
    '12054': { y: 0.0577, anchor: 382938 },
    '14260': { y: 0.0444, anchor: 496288 },
    '19780': { y: 0.0524, anchor: 296070 },
    '16984': { y: 0.0768, anchor: 353998 },
    '26900': { y: 0.0630, anchor: 295921 },
    '28140': { y: 0.0564, anchor: 329641 },
    '31140': { y: 0.0587, anchor: 283232 },
    '35380': { y: 0.0733, anchor: 264891 },
    '14454': { y: 0.0519, anchor: 741868 },
    '49340': { y: 0.0543, anchor: 482611 },
    '12580': { y: 0.0567, anchor: 405877 },
    '19804': { y: 0.0669, anchor: 269080 },
    '24340': { y: 0.0541, anchor: 359923 },
    '33460': { y: 0.0524, anchor: 393774 },
    '41180': { y: 0.0629, anchor: 276878 },
    '16740': { y: 0.0535, anchor: 390321 },
    '39580': { y: 0.0464, anchor: 438364 },
    '36540': { y: 0.0558, anchor: 310337 },
    '29820': { y: 0.0484, anchor: 430650 },
    '10580': { y: 0.0544, anchor: 370533 },
    '15380': { y: 0.0601, anchor: 288316 },
    '35614': { y: 0.0578, anchor: 727625 },
    '17140': { y: 0.0607, anchor: 311270 },
    '17410': { y: 0.0695, anchor: 252210 },
    '18140': { y: 0.0548, anchor: 333537 },
    '36420': { y: 0.0680, anchor: 246872 },
    '38900': { y: 0.0391, anchor: 552022 },
    '37964': { y: 0.0588, anchor: 390463 },
    '38300': { y: 0.0776, anchor: 235539 },
    '39300': { y: 0.0494, anchor: 524867 },
    '17900': { y: 0.0724, anchor: 257718 },
    '24860': { y: 0.0588, anchor: 315285 },
    '32820': { y: 0.0700, anchor: 247229 },
    '34980': { y: 0.0473, anchor: 455958 },
    '12420': { y: 0.0458, anchor: 428524 },
    '19124': { y: 0.0549, anchor: 366823 },
    '21340': { y: 0.0783, anchor: 232910 },
    '26420': { y: 0.0638, anchor: 308306 },
    '41700': { y: 0.0601, anchor: 280297 },
    '41620': { y: 0.0346, anchor: 568656 },
    '40060': { y: 0.0532, anchor: 397705 },
    '47260': { y: 0.0598, anchor: 373678 },
    '42644': { y: 0.0357, anchor: 750279 },
    '33340': { y: 0.0473, anchor: 390238 }
  };

  function rentBasis(code, cityId) {
    if (cityId && CITY_RENT[cityId]) return CITY_RENT[cityId];
    return RENT[code] || RENT.US;
  }

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
    var rent = rentBasis(code, cityId);
    if (cityId) {
      for (i = 0; i < list.length; i++) {
        if (list[i].id === cityId) {
          return {
            kind: 'city',
            rate: list[i].rate,
            ins: list[i].ins || state.ins,
            insFrom: list[i].ins ? 'city' : 'state',
            grossYield: rent.y,
            yieldAnchor: rent.anchor,
            city: list[i],
            state: state,
            code: code
          };
        }
      }
    }
    rent = RENT[code] || RENT.US;
    return {
      kind: 'state',
      rate: state.rate,
      ins: state.ins,
      insFrom: 'state',
      grossYield: rent.y,
      yieldAnchor: rent.anchor,
      city: null,
      state: state,
      code: code
    };
  }

  root.HomeMarkets = {
    SPAN: SPAN,
    DWELLING: DWELLING,
    STATES: STATES,
    CITIES: CITIES,
    options: options,
    cities: cities,
    place: place
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
