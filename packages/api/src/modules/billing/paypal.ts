import type { Env } from "../../config/env";

type PayPalEnv = "sandbox" | "live";

function getBaseUrl(env: PayPalEnv) {
  return env === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

async function getAccessToken(
  clientId: string,
  clientSecret: string,
  env: PayPalEnv,
): Promise<string> {
  const res = await fetch(`${getBaseUrl(env)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    throw new Error(`PayPal auth failed: ${res.status}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export function createPayPalClient(config: {
  clientId: string;
  clientSecret: string;
  env: PayPalEnv;
  webhookId: string;
}) {
  const baseUrl = getBaseUrl(config.env);

  async function request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const token = await getAccessToken(config.clientId, config.clientSecret, config.env);
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers ?? {}),
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`PayPal API ${res.status}: ${body}`);
    }

    // 204 No Content or empty body — return undefined (void responses)
    if (res.status === 204 || res.headers.get("content-length") === "0") {
      return undefined as T;
    }

    return res.json() as Promise<T>;
  }

  return {
    createSubscription(planId: string, returnUrl: string, cancelUrl: string) {
      return request<{
        id: string;
        status: string;
        links: Array<{ href: string; rel: string }>;
      }>("/v1/billing/subscriptions", {
        method: "POST",
        body: JSON.stringify({
          plan_id: planId,
          application_context: {
            return_url: returnUrl,
            cancel_url: cancelUrl,
            shipping_preference: "NO_SHIPPING",
            user_action: "SUBSCRIBE_NOW",
          },
        }),
      });
    },

    getSubscription(subscriptionId: string) {
      return request<{
        id: string;
        status: string;
        plan_id: string;
        start_time: string;
        billing_info: {
          next_billing_time?: string;
          last_payment?: { amount: { value: string; currency_code: string }; time: string };
          failed_payments_count: number;
        };
      }>(`/v1/billing/subscriptions/${subscriptionId}`);
    },

    cancelSubscription(subscriptionId: string, reason: string) {
      return request<void>(`/v1/billing/subscriptions/${subscriptionId}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    },

    async verifyWebhookSignature(headers: Record<string, string>, rawBody: string) {
      const token = await getAccessToken(config.clientId, config.clientSecret, config.env);
      const res = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          auth_algo: headers["paypal-auth-algo"],
          cert_url: headers["paypal-cert-url"],
          transmission_id: headers["paypal-transmission-id"],
          transmission_sig: headers["paypal-transmission-sig"],
          transmission_time: headers["paypal-transmission-time"],
          webhook_id: config.webhookId,
          webhook_event: JSON.parse(rawBody),
        }),
      });

      if (!res.ok) return false;
      const data = (await res.json()) as { verification_status: string };
      return data.verification_status === "SUCCESS";
    },
  };
}

export function createPayPalClientFromEnv(env: Env) {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET || !env.PAYPAL_WEBHOOK_ID) {
    return null;
  }
  return createPayPalClient({
    clientId: env.PAYPAL_CLIENT_ID,
    clientSecret: env.PAYPAL_CLIENT_SECRET,
    env: env.PAYPAL_ENV,
    webhookId: env.PAYPAL_WEBHOOK_ID,
  });
}
