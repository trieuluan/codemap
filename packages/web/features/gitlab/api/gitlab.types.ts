export type GitlabConnectionStatus =
  | { connected: false; gitlabLogin: null }
  | { connected: true; gitlabLogin: string; scope: string; connectedAt: string };

export type GitlabConnectUrlResponse = {
  url: string;
};
