/** Site-wide settings. Edit before launch. */
export const SITE = {
  name: 'GreenWattz',
  domain: 'greenwattz.eu',
  /** Where "request an introduction" emails go. Set to the address you want to receive them. */
  contactEmail: 'hello@greenwattz.eu',
  /** Operator details shown in the privacy policy. Replace before launch. */
  operator: '[Your legal name or company], Ireland',
  lastUpdated: '18 October 2026',
};

/**
 * When an installer in this list is chosen in the quote flow, we ask whether the user would like an
 * introduction from an existing customer. Keep to installers whose referral rules allow it.
 */
export const INTRODUCTION_INSTALLERS = ['pvgen'];
