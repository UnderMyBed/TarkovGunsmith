#!/usr/bin/env bash
# Single-quoted $names are jq variables (--arg), not shell.
# shellcheck disable=SC2016
# A stand-in for gcx that grafana-apply.test.ts puts on PATH as `gcx`. It never touches the
# network: lists are served from JSON files in $FAKE_GCX_STATE, writes update those files, and
# every call is appended to $FAKE_GCX_STATE/calls. A call starting with $FAKE_GCX_FAIL exits 1.
set -euo pipefail
state="$FAKE_GCX_STATE"
echo "$*" >>"$state/calls"
if [ -n "${FAKE_GCX_FAIL:-}" ] && [[ "$*" == "$FAKE_GCX_FAIL"* ]]; then
  echo "fake gcx: failing $*" >&2
  exit 1
fi

file_arg() {
  local prev=""
  for arg in "$@"; do
    [ "$prev" = "-f" ] && echo "$arg"
    prev="$arg"
  done
}
is_dry_run() { [[ " $* " == *" --dry-run "* ]]; }
append() { # state file, jq expression, jq args...
  local target="$state/$1" expr="$2"
  shift 2
  jq "$@" "(. // []) + [$expr]" "$target" >"$target.tmp"
  mv "$target.tmp" "$target"
}

case "${1:-} ${2:-} ${3:-}" in
  "--version  ") echo "gcx fake" ;;
  "resources push -p") ;;
  "alert contact-points list") cat "$state/contact-points.json" ;;
  "alert contact-points create")
    f="$(file_arg "$@")"
    cp "$f" "$state/contact-point-sent.yaml"
    append contact-points.json '{uid: $u, name: $n}' --arg u "$(yq -r .uid "$f")" --arg n "$(yq -r .name "$f")"
    ;;
  "alert contact-points update") cp "$(file_arg "$@")" "$state/contact-point-sent.yaml" ;;
  "synthetic-monitoring checks list") cat "$state/checks.json" ;;
  "synthetic-monitoring checks create")
    is_dry_run "$@" && exit 0
    f="$(file_arg "$@")"
    append checks.json '{metadata: {name: ($j + "-" + ($id | tostring))}, spec: {job: $j, target: $t}}' \
      --arg j "$(yq -r .spec.job "$f")" --arg t "$(yq -r .spec.target "$f")" --argjson id "$RANDOM"
    ;;
  "synthetic-monitoring checks update") ;;
  "frontend apps list") cat "$state/faro-apps.json" ;;
  "frontend apps create")
    f="$(file_arg "$@")"
    append faro-apps.json \
      '{metadata: {name: ($n + "-7")}, spec: {name: $n, appKey: "abc123", collectEndpointURL: "https://faro-collector-prod-us-west-0.grafana.net/collect"}}' \
      --arg n "$(yq -r .spec.name "$f")"
    ;;
  "frontend apps update") ;;
  *)
    echo "fake gcx: unhandled call: $*" >&2
    exit 2
    ;;
esac
