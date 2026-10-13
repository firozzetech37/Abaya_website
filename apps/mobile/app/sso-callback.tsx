import { Redirect } from 'expo-router';

/**
 * Target of Clerk's OAuth redirect (abaya://sso-callback). The login screen finishes the
 * Google flow from openAuthSessionAsync's result; if the OS opens this route directly
 * (some Android browsers do), just go home.
 */
export default function SsoCallback() {
  return <Redirect href="/" />;
}
