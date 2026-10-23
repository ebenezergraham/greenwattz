/** Site-wide settings. Edit before launch. */
export const SITE = {
  name: 'GreenWattz',
  domain: 'greenwattz.eu',
  /** Where "request an introduction" emails go. Set to the address you want to receive them. */
  contactEmail: 'hello@greenwattz.eu',
  /**
   * Referral requests are sent through Web3Forms, which emails them to contactEmail. Create a free access key at
   * https://web3forms.com using that address and paste it here. Access keys are meant to be public.
   * While this is empty the form falls back to opening a draft email.
   */
  formAccessKey: '6cddef7e-ca16-42a6-a7f3-4d465bf1759b',
  formEndpoint: 'https://api.web3forms.com/submit',
  /**
   * Where "Buy me a coffee" points, for example https://buymeacoffee.com/yourname. Leave empty to hide every support link.
   * It is a plain link, so nothing loads from Buy Me a Coffee until someone clicks it.
   */
  supportUrl: 'https://buymeacoffee.com/greenwattz.eu',
  /** Operator details shown in the privacy policy. Replace before launch. */
  operator: '[Your legal name or company], Ireland',
  lastUpdated: '23 October 2026',
};

/**
 * When an installer in this list is chosen in the quote flow, we ask whether the user would like an
 * introduction from an existing customer. Keep to installers whose referral rules allow it.
 */
export const INTRODUCTION_INSTALLERS = ['pvgen'];

/** What to confirm with every installer before accepting a quote. Shown in the planner and on the estimates page. */
export const INSTALLER_CHECKLIST = [
  'Is the quote itemised, with the panel, inverter and battery brand and model?',
  'For a battery: the usable kWh (not nominal), the power output in kW, the warranty years and the guaranteed cycles.',
  'Panel, inverter and workmanship warranties, in writing.',
  'What is included: scaffolding, the ESB Networks application, SEAI grant paperwork, and commissioning.',
  'Whether the SEAI grant is taken off the price, and whether your home qualifies.',
  'How they estimate your savings, and which export rate and electricity price they assume.',
  'How long the price is valid, and the payment terms.',
  'Who you call if something fails after installation, and how quickly they respond.',
];
