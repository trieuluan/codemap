export interface GithubStatus {
  connected: boolean;
  githubLogin: string | null;
  scope?: string;
  connectedAt?: string;
}

export interface GithubRepository {
  id: string;
  name: string;
  fullName: string;
  ownerLogin: string;
  defaultBranch: string | null;
  private: boolean;
  repositoryUrl: string;
}
