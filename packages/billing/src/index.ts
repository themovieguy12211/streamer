export type CryptoCheckout = { reference: string; paymentAddress: string; amount: string; currency: string; expiresAt: Date };
export interface BillingProvider { createPremiumCheckout(input: { userId: string; planId: string }): Promise<CryptoCheckout>; verifyWebhook(payload: string, signature?: string): Promise<{ reference: string; status: 'ACTIVE' | 'EXPIRED' }>; }
