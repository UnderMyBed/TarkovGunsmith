#!/usr/bin/env bash
# Single-quoted $names below are jq variables (--arg) and envsubst's variable list, not shell.
# shellcheck disable=SC2016
# Applies every Grafana object in infra/grafana/ to the `shipman` stack, then prints the Faro
# collector URL the site build needs. Run by .github/workflows/grafana.yml; never by hand.
#
# Each object is applied the one way gcx can apply it idempotently:
#   folder, alert rule  `gcx resources push`, dry run first
#   SM checks           matched by job + target, then `checks update` or `checks create`
#   contact point       matched by name, then `contact-points update` or `create`
#   Faro app            matched by name, then `frontend apps update` or `create`
# Every lookup that finds more than one match fails: a duplicate is a fault to fix, not to pick from.
#
# Every gcx call that the next step depends on is its own statement, never an argument to
# another command: bash ignores the exit status of a command substitution used as an argument,
# so a failed list there would read as "nothing exists" and the script would create a duplicate.
# inherit_errexit keeps errexit on inside every $(...).
#
# Needs: GRAFANA_SERVER, GRAFANA_TOKEN, GRAFANA_STACK_ID, GRAFANA_PROVIDER_SYNTH_SM_URL,
#        GRAFANA_PROVIDER_SYNTH_SM_TOKEN, GRAFANA_ALERT_EMAIL. Optional: GITHUB_OUTPUT.
set -euo pipefail
shopt -s inherit_errexit

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

for var in GRAFANA_SERVER GRAFANA_TOKEN GRAFANA_STACK_ID GRAFANA_PROVIDER_SYNTH_SM_URL \
  GRAFANA_PROVIDER_SYNTH_SM_TOKEN GRAFANA_ALERT_EMAIL; do
  if [ -z "${!var:-}" ]; then
    echo "::error::$var is not set. See docs/operations/observability.md" >&2
    exit 1
  fi
done

# Prints the single value jq selects from a gcx list, nothing when there is none, and fails when
# there is more than one, or when the list is not a JSON array (gcx prints `null` for none).
one_or_none() { # what, json, jq filter, jq args...
  local what="$1" json="$2" filter="$3"
  shift 3
  local found count
  if ! jq -e '. == null or type == "array"' <<<"$json" >/dev/null; then
    echo "::error::listing $what did not return a JSON array: ${json:0:200}" >&2
    exit 1
  fi
  found="$(jq -r "$@" "[(. // [])[] | $filter]" <<<"$json")"
  count="$(jq 'length' <<<"$found")"
  if [ "$count" -gt 1 ]; then
    echo "::error::$count objects match $what; delete the extras (docs/operations/observability.md)" >&2
    exit 1
  fi
  jq -r '.[0] // empty' <<<"$found"
}

push_resources() { # dir
  local dir="$1"
  echo "== push $dir"
  gcx resources push -p "$dir" --dry-run --on-error abort
  gcx resources push -p "$dir" --on-error abort
}

apply_contact_point() {
  local file="$here/contact-point.yaml" rendered="$work/contact-point.yaml" name list uid
  name="$(yq -r '.name' "$file")"
  # Only the one variable is substituted, so nothing else in the file can be expanded.
  envsubst '$GRAFANA_ALERT_EMAIL' <"$file" >"$rendered"
  list="$(gcx alert contact-points list --limit 0 -o json)"
  uid="$(one_or_none "contact point \"$name\"" "$list" 'select(.name == $n) | .uid' --arg n "$name")"
  if [ -n "$uid" ]; then
    echo "== contact point \"$name\": update $uid"
    gcx alert contact-points update "$uid" -f "$rendered" -o json >/dev/null
  else
    echo "== contact point \"$name\": create"
    gcx alert contact-points create -f "$rendered" -o json >/dev/null
  fi
}

apply_check() { # file
  local file="$1" job target list name
  job="$(yq -r '.spec.job' "$file")"
  target="$(yq -r '.spec.target' "$file")"
  list="$(gcx synthetic-monitoring checks list --limit 0 -o json)"
  name="$(one_or_none "check $job -> $target" "$list" \
    'select(.spec.job == $j and .spec.target == $t) | .metadata.name' \
    --arg j "$job" --arg t "$target")"
  # `checks create` rewrites metadata.name in the file it reads; give it a copy.
  cp "$file" "$work/check.yaml"
  if [ -n "$name" ]; then
    echo "== check $job: update $name"
    gcx synthetic-monitoring checks update "$name" -f "$work/check.yaml" --dry-run
    gcx synthetic-monitoring checks update "$name" -f "$work/check.yaml"
  else
    echo "== check $job: create"
    gcx synthetic-monitoring checks create -f "$work/check.yaml" --dry-run
    gcx synthetic-monitoring checks create -f "$work/check.yaml"
  fi
}

# Upserts the Faro app and sets FARO_URL to its collector URL. Called as a plain statement,
# never inside $(...), so a failed write stops the script.
FARO_URL=""
apply_faro_app() {
  local file="$here/faro-app.yaml" name list slug app key endpoint url host
  name="$(yq -r '.spec.name' "$file")"
  list="$(gcx frontend apps list --limit 0 -o json)"
  slug="$(one_or_none "Faro app \"$name\"" "$list" 'select(.spec.name == $n) | .metadata.name' \
    --arg n "$name")"
  if [ -n "$slug" ]; then
    echo "== Faro app \"$name\": update $slug"
    gcx frontend apps update "$slug" -f "$file" -o json >/dev/null
  else
    echo "== Faro app \"$name\": create"
    gcx frontend apps create -f "$file" -o json >/dev/null
  fi

  # Read back what exists now rather than trusting the write's reply.
  list="$(gcx frontend apps list --limit 0 -o json)"
  app="$(one_or_none "Faro app \"$name\"" "$list" 'select(.spec.name == $n)' --arg n "$name")"
  if [ -z "$app" ]; then
    echo "::error::Faro app \"$name\" is missing after apply" >&2
    exit 1
  fi
  key="$(jq -r '.spec.appKey // empty' <<<"$app")"
  endpoint="$(jq -r '.spec.collectEndpointURL // empty' <<<"$app")"
  if [ -z "$key" ] || [ -z "$endpoint" ]; then
    echo "::error::Faro app \"$name\" has no appKey or collectEndpointURL: $app" >&2
    exit 1
  fi
  # The API has returned both the bare endpoint and one already ending in the key.
  endpoint="${endpoint%/}"
  if [[ "$endpoint" == */"$key" ]]; then url="$endpoint"; else url="$endpoint/$key"; fi
  if ! [[ "$url" =~ ^https://(faro-collector-[a-z0-9-]+\.grafana\.net)/collect/[A-Za-z0-9]+$ ]]; then
    echo "::error::unexpected Faro collector URL: $url" >&2
    exit 1
  fi
  host="${BASH_REMATCH[1]}"
  # The site's CSP must admit the collector, or every Faro request is blocked in production.
  if ! grep -q "connect-src[^;]*https://$host" "$repo/apps/web/public/_headers"; then
    echo "::error::https://$host is not in connect-src in apps/web/public/_headers" >&2
    exit 1
  fi
  FARO_URL="$url"
}

push_resources "$here/resources/folder"
apply_contact_point
for check in "$here"/checks/*.yaml; do apply_check "$check"; done
push_resources "$here/resources/alerting"
apply_faro_app

echo "== Faro collector: $FARO_URL"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "faro_url=$FARO_URL" >>"$GITHUB_OUTPUT"
fi
