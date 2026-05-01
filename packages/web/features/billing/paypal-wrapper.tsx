"use client";

import type { ReactNode } from "react";
import { PayPalProvider } from "@paypal/react-paypal-js/sdk-v6";

export default function PayPalWrapper({
  children,
  clientId,
}: {
  children: ReactNode;
  clientId?: string;
}) {
  if (!clientId) return <>{children}</>;

  return (
    <PayPalProvider
      clientId={clientId}
      components={["paypal-subscriptions"]}
      pageType="checkout"
    >
      {children}
    </PayPalProvider>
  );
}
