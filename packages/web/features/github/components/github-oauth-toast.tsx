import { OAuthCallbackToast } from "@/features/integrations/components/oauth-callback-toast";

export function GithubOAuthToast() {
  return (
    <OAuthCallbackToast
      connectedParam="github_connected"
      errorParam="github_error"
      providerName="GitHub"
      defaultDescription="Your GitHub account is now linked."
      errorMessages={{
        expired_state: "The authorization link expired. Please try again.",
        token_exchange_failed: "GitHub authorization failed. Please try again.",
        invalid_request: "Invalid request. Please try again.",
      }}
    />
  );
}
