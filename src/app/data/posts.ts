/**
 * Blog posts. Plain data, so adding a post is one new object here. Text supports **bold** and [label](url).
 * Posts describe the rules as they stood on their date. The page adds a "rules change" reminder automatically.
 */
export type Block =
  | { t: 'h2'; text: string }
  | { t: 'h3'; text: string }
  | { t: 'p'; text: string }
  | { t: 'ul'; items: string[] }
  | { t: 'ol'; items: string[] }
  | { t: 'callout'; title: string; text: string }
  | { t: 'table'; caption: string; head: string[]; rows: string[][] };

export interface Post {
  slug: string;
  title: string;
  description: string;
  date: string; // ISO yyyy-mm-dd
  tags: string[];
  takeaways: string[];
  blocks: Block[];
  sources: { label: string; url: string }[];
}

const SEAI_SOLAR = 'https://www.seai.ie/grants/home-energy-grants/individual-grants/solar-electricity-grant';
const SEAI_BATTERY = 'https://www.seai.ie/grants/home-energy-grants/individual-grants/battery';
const SEAI_ENHANCED = 'https://www.seai.ie/news-and-events/news/enhanced-grants';

export const POSTS: Post[] = [
  {
    slug: 'budget-2027-solar-grants',
    title: 'Budget 2027 and your solar grants: what changed in October',
    description: 'Two announcements landed in the same week: an SEAI grant package and Budget 2027. Here is what changed for home solar, which homes qualify now, and what is still unclear.',
    date: '2026-10-18',
    tags: ['Budget 2027', 'SEAI grants', 'Export income'],
    takeaways: [
      'More homes now qualify. SEAI\'s solar grant covers homes built and occupied **before 2025**. It used to be before 2021.',
      'There is a **new €600 SEAI grant for a home battery** of 5 kWh or more.',
      'The solar grant amount did **not** change: up to €1,800 for a 4 kWp system.',
      'Budget 2027 raises the **tax-free allowance on solar export income from €400 to €600 a year per person**. The start date is not confirmed yet.',
      'Some households on certain welfare payments can get **up to €9,000** towards a 4 kWp system and a 5 kWh battery.',
    ],
    blocks: [
      { t: 'h2', text: 'Two announcements, not one' },
      { t: 'p', text: 'It is easy to mix these up, because they landed within a week of each other. On **29 September 2026** the Government announced a package of SEAI grant changes. Most of it opened on **6 October**, subject to final implementation arrangements. The **Budget itself**, delivered the same day, added a tax change for people who sell electricity back to the grid and set how much money SEAI has to spend in 2027.' },
      { t: 'p', text: 'The headline grant changes (more eligible homes and the battery grant) came from the SEAI package, not from the Budget. The Budget did not change the solar grant rates.' },

      { t: 'h2', text: 'What changed, at a glance' },
      {
        t: 'table',
        caption: 'Home solar measures announced in late September and on Budget day',
        head: ['Measure', 'What changed', 'Where it came from', 'Status'],
        rows: [
          ['Solar PV grant: which homes', 'Homes built and occupied before 2025 (was before 2021)', 'SEAI package, 29 September', 'Open from 6 October'],
          ['Solar PV grant: amount', 'Unchanged. €700 per kWp for the first 2 kWp, €200 per kWp up to 4 kWp, maximum €1,800', 'Existing SEAI scheme', 'In place'],
          ['Battery grant', 'New. €600 for a battery of 5 kWh or more, fitted by an SEAI-registered solar installer', 'SEAI package, 29 September', 'Open from 6 October'],
          ['Enhanced grants', 'Up to €9,000 towards a 4 kWp system and a 5 kWh battery for homeowners on certain welfare payments. Households in the Warmer Homes Scheme get fully funded systems', 'SEAI package, 29 September', 'Announced. Check SEAI for how to apply'],
          ['Tax-free export income', '€400 to €600 a year per person, covering income tax, USC and PRSI', 'Budget 2027, 6 October', 'Start date to be set in the Finance Bill. Reported as 1 January 2027, not confirmed'],
          ['VAT on solar panels', 'Stays at 0%', 'Budget 2027', 'Unchanged'],
          ['SEAI funding', '€654.5 million for home and community energy upgrades in 2027', 'Budget 2027', 'Confirmed'],
          ['Boiler scrappage', 'New €2,000 payment when you replace fossil fuel heating with a heat pump, for homes built before 2021', 'SEAI package, 29 September', 'Starts in the first quarter of 2027. Rules not yet published'],
        ],
      },
      { t: 'p', text: 'One thing that was **not** in the Budget: a universal electricity credit. There is none this year.' },

      { t: 'h2', text: 'Which homes are eligible now?' },
      { t: 'p', text: 'The solar and battery grants now use the same age rule. Your home must have been **built and occupied before 2025**. If it was first lived in during 2025 or later, it does not qualify, so check the year your home was first occupied before you plan around the grant. Our [planner](/plan) asks for it and takes the grants off if you are over the line.' },
      { t: 'p', text: 'Age is only the first test. SEAI also expects:' },
      {
        t: 'ul',
        items: [
          'You own the home. Private landlords and owner management companies can apply too.',
          'The home has an **MPRN**, the number that identifies your electricity meter. It is on your bill. See the [glossary](/glossary#mprn).',
          'No earlier SEAI funding of the same kind at that MPRN. Only one solar PV system is supported per property.',
          'An **SEAI-registered installer** does the work. You can browse the [register](/seai-installers).',
          'You get your **grant offer before work starts**, then have 8 months to finish and send in the paperwork.',
          'A BER assessment after the work, before the grant is paid.',
        ],
      },
      { t: 'callout', title: 'Apply before you buy', text: 'Costs you incur before SEAI approves your application can make the work ineligible, and in some cases the whole grant can be withdrawn. Get the grant offer in writing first. Your installer also has to apply to ESB Networks before installing, which usually takes at least four weeks.' },

      { t: 'h2', text: 'The export income allowance, explained' },
      { t: 'p', text: 'If you have solar panels, you can sell surplus electricity to your supplier under the Clean Export Guarantee. That income is normally taxable. Revenue lets you earn a set amount each year **tax-free**, with no income tax, USC or PRSI on it. Budget 2027 raises that amount from **€400 to €600 a year**.' },
      { t: 'p', text: 'The allowance is **per person**. Where more than one person is named on the electricity bill, each can use it, so a couple could have up to **€1,200** between them. That is how Revenue\'s guidance has been reported by [SolarQuotes Ireland](https://solarquotesireland.ie/budget-2027-energy-measures-ireland/).' },
      { t: 'p', text: 'There is a catch on timing. The Budget documents did not give a start date. The change has to be written into the Finance Bill, and it has been reported as starting on **1 January 2027**, but that is not confirmed. For the 2026 tax year, treat **€400** as the safe figure. The exemption is currently set to end on 31 December 2028.' },
      { t: 'h3', text: 'Does it matter for you?' },
      { t: 'p', text: 'For many homes, not much. A typical 4 kWp system exports less than €400 a year, so it is already inside the old limit. The change mostly helps larger systems of about 6 kWp and up, which earn more from exports.' },
      { t: 'p', text: 'As an example, our planner\'s default home (a semi-detached house using 4,200 kWh a year, with a 5.3 kWp system) is estimated to earn around **€550 a year** from exports. That is above the old €400 limit and inside the new €600 one. This is a model estimate with October 2026 assumptions, not a promise.' },
      { t: 'callout', title: 'Tell the planner who is on your bill', text: 'The [GreenWattz planner](/plan) asks how many people are named on your electricity bill, adds the allowance for each, and taxes any export income above it in your payback. You can switch between €400 and €600 in the assumptions.' },

      { t: 'h2', text: 'What it means in practice' },
      { t: 'p', text: 'Here is how the grants change the maths for the same home, using the planner\'s default assumptions and October 2026 prices. These are estimates to show the effect of the grants, not quotes.' },
      {
        t: 'table',
        caption: 'The same semi-detached home with and without the grants (planner estimates, October 2026)',
        head: ['Scenario', 'Installed cost', 'SEAI grants', 'You pay', 'Payback'],
        rows: [
          ['12 panels (5.3 kWp), no battery', 'About €8,800', '€1,800 solar', 'About €7,000', 'About 5.8 years'],
          ['Same, plus a 10 kWh battery', 'About €16,050', '€1,800 solar + €600 battery', 'About €13,650', 'About 12.6 years'],
          ['12 panels, home first occupied in 2025 or later', 'About €8,800', 'None', 'About €8,800', 'About 7.3 years'],
        ],
      },
      { t: 'p', text: 'The new battery grant helps, but it is small next to the price of a battery. For most homes, panels alone still pay back much faster than panels plus a battery. A battery tends to make sense if you use a lot of power in the evening and at night, or you are adding an electric car or a heat pump. Use the planner to test your own usage.' },

      { t: 'h2', text: 'What is still unclear' },
      {
        t: 'ul',
        items: [
          'The **start date** and exact wording of the €600 export allowance, which will be set in the Finance Bill.',
          'How the **enhanced grants** for people on certain welfare payments are applied for. SEAI says it will publish detailed criteria and rates before each measure opens.',
          'The detailed rules for the **boiler scrappage** payment, due in early 2027.',
          'The Government\'s Energy Affordability Action Plan, expected in the weeks after the Budget.',
        ],
      },

      { t: 'h2', text: 'What to do next' },
      {
        t: 'ol',
        items: [
          'Check the year your home was first occupied. Before 2025 means you are on the right side of the line.',
          'Work out your roof, usage and options in the [planner](/plan). It shows the grants taken off your cost.',
          'Get at least three written quotes from [SEAI-registered installers](/seai-installers), and ask them the questions on our [estimates page](/estimates).',
          'Get your grant offer from SEAI **before** any work starts.',
        ],
      },
      { t: 'p', text: 'This article is general information, not financial or tax advice, and GreenWattz is independent of SEAI and the Government. Check the official pages linked below, and ask Revenue or a tax adviser about your own position.' },
    ],
    sources: [
      { label: 'SEAI: solar electricity grant', url: SEAI_SOLAR },
      { label: 'SEAI: battery grant', url: SEAI_BATTERY },
      { label: 'SEAI: enhanced grants announcement', url: SEAI_ENHANCED },
      { label: 'RTÉ: boiler scrappage among new expanded energy grants', url: 'https://www.rte.ie/news/2026/0929/1593272-boiler-scrappage-grant/' },
      { label: 'SolarInfo.ie: the Budget 2027 energy measures', url: 'https://www.solarinfo.ie/blog/budget-2027-solar-heat-pumps-energy-bills' },
      { label: 'SolarQuotes Ireland: Budget 2027 energy measures', url: 'https://solarquotesireland.ie/budget-2027-energy-measures-ireland/' },
      { label: 'Revenue', url: 'https://www.revenue.ie/' },
    ],
  },
];

export const postBySlug = (slug: string | null | undefined) => POSTS.find((p) => p.slug === slug);
