import { NativeModules, TurboModuleRegistry } from 'react-native';

/** Subset of react-native-razorpay's options that we send. */
export interface RazorpayOpenOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: 'INR';
  name: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
}

export interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
}

interface RazorpayModule {
  open(options: RazorpayOpenOptions): Promise<RazorpaySuccess>;
}

let cached: RazorpayModule | null | undefined;

/**
 * react-native-razorpay's native module is not in Expo Go. Importing the JS
 * package there throws (NativeEventEmitter needs the native module), so we only
 * require it when the native module is actually registered.
 */
export function getRazorpay(): RazorpayModule | null {
  if (cached !== undefined) return cached;
  let hasNative = false;
  try {
    hasNative = Boolean(TurboModuleRegistry.get('RNRazorpayCheckout') ?? NativeModules.RNRazorpayCheckout);
  } catch {
    hasNative = Boolean(NativeModules.RNRazorpayCheckout);
  }
  if (!hasNative) {
    cached = null;
    return cached;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- guarded optional native module
    const mod = require('react-native-razorpay') as { default: RazorpayModule };
    cached = mod.default;
  } catch {
    cached = null;
  }
  return cached;
}

export const isRazorpayAvailable = () => getRazorpay() !== null;
