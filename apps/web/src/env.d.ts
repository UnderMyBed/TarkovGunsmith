interface ImportMetaEnv {
  /**
   * The Faro collector URL, key included. Set only by the release build in deploy.yml, from
   * the Faro app infra/grafana/apply.sh applied. Unset everywhere else, so nothing is sent.
   */
  readonly VITE_FARO_URL?: string;
}
