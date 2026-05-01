declare module "@paypal/react-paypal-js/sdk-v6" {
  import type { ComponentType, ReactNode } from "react";

  export type OnApproveDataSubscriptions = {
    subscriptionId: string;
    payerId?: string;
  };

  export interface PayPalProviderProps {
    clientId?: string | Promise<string>;
    clientToken?: string | Promise<string>;
    components?: string[];
    pageType?: string;
    children: ReactNode;
  }

  export type PayPalSubscriptionPresentationMode =
    | "auto"
    | "popup"
    | "modal"
    | "payment-handler";

  export interface PayPalSubscriptionButtonProps {
    createSubscription: () => Promise<{ subscriptionId: string }>;
    onApprove?: (data: OnApproveDataSubscriptions) => Promise<void>;
    onCancel?: () => void;
    onError?: (error: unknown) => void;
    presentationMode: PayPalSubscriptionPresentationMode;
    style?: Record<string, unknown>;
    disabled?: boolean;
  }

  export const PayPalProvider: ComponentType<PayPalProviderProps>;
  export const PayPalSubscriptionButton: ComponentType<PayPalSubscriptionButtonProps>;
}
