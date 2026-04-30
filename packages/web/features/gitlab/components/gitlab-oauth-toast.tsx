import { OAuthCallbackToast } from "@/features/integrations/components/oauth-callback-toast";

export function GitlabOAuthToast() {
  return (
    <OAuthCallbackToast
      connectedParam="gitlab_connected"
      errorParam="gitlab_error"
      providerName="GitLab"
      defaultDescription="Your GitLab account is now linked."
      errorMessages={{
        expired_state: "The authorization link expired. Please try again.",
        token_exchange_failed: "GitLab authorization failed. Please try again.",
        invalid_request: "Invalid request. Please try again.",
      }}
    />
  );
}
