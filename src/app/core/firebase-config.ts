/**
 * The public settings of our Firebase web app. They identify the project and are safe to publish: what protects the data is
 * firestore.rules and the sign-in. Leave apiKey empty to switch accounts off everywhere.
 * Restrict the API key to the website's addresses in Google Cloud (Credentials, HTTP referrers).
 */
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCbwdm4hgXKnUK-cL1uF7HImSvED7sV5m4',
  authDomain: 'greenwattz-eu.firebaseapp.com',
  projectId: 'greenwattz-eu',
  appId: '1:220822704501:web:324b85555921d379a9833c',
};
