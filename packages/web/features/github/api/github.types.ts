export type GithubConnectionStatus =
  | { connected: false; githubLogin: null }
  | { connected: true; githubLogin: string; scope: string; connectedAt: string };

export type GithubConnectUrlResponse = {
  url: string;
};
