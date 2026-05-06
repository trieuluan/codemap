import { siGithub, siGitlab } from "simple-icons";

export function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d={siGithub.path} />
    </svg>
  );
}

export function GitlabIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d={siGitlab.path} />
    </svg>
  );
}
