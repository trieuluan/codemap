export interface GitlabStatus {
  connected: boolean;
  gitlabLogin: string | null;
  scope?: string;
  connectedAt?: string;
}

export interface GitlabRepository {
  id: string;
  name: string;
  fullName: string;
  ownerLogin: string;
  defaultBranch: string | null;
  private: boolean;
  repositoryUrl: string;
}
