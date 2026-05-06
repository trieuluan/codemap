export type GitlabConnectionStatus =
  | { connected: false; gitlabLogin: null }
  | { connected: true; gitlabLogin: string; scope: string; connectedAt: string };

export type GitlabConnectUrlResponse = {
  url: string;
};

export type GitlabRepositoryOption = {
  id: string;
  name: string;
  fullName: string;
  ownerLogin: string;
  defaultBranch: string | null;
  private: boolean;
  repositoryUrl: string;
};
