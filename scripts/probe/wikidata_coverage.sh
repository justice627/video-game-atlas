#!/usr/bin/env bash
# Reproduces the Wikidata coverage numbers in docs/feasibility.md.
# Usage: bash scripts/probe/wikidata_coverage.sh
set -euo pipefail
run() {
  echo "== $1"
  curl -sS -G https://query.wikidata.org/sparql \
    --data-urlencode "query=$2" -H 'Accept: text/csv' \
    -H 'User-Agent: video-game-atlas-feasibility/0.1' --max-time 120
  echo
}
G='?g wdt:P31/wdt:P279* wd:Q7889'   # instance of (subclass of) video game

run "Games in Wikidata" 'SELECT (COUNT(DISTINCT ?g) AS ?n) WHERE { ?g wdt:P31 wd:Q7889 }'
run "Games with a narrative location (P840)" "SELECT (COUNT(DISTINCT ?g) AS ?n) WHERE { $G ; wdt:P840 ?l }"
run "...whose location has coordinates (P625)" "SELECT (COUNT(DISTINCT ?g) AS ?n) WHERE { $G ; wdt:P840 ?l . ?l wdt:P625 ?c }"
run "Games with a set-in period (P2408)" "SELECT (COUNT(DISTINCT ?g) AS ?n) WHERE { $G ; wdt:P2408 ?p }"
run "Games with coordinates AND period" "SELECT (COUNT(DISTINCT ?g) AS ?n) WHERE { $G ; wdt:P840 ?l ; wdt:P2408 ?p . ?l wdt:P625 ?c }"
run "Location granularity" "SELECT ?bucket (COUNT(DISTINCT ?g) AS ?n) WHERE { $G ; wdt:P840 ?l .
  BIND(IF(EXISTS{?l wdt:P31 wd:Q6256},\"country\",IF(EXISTS{?l wdt:P31/wdt:P279* wd:Q515},\"city\",
  IF(EXISTS{?l wdt:P31/wdt:P279* wd:Q41176},\"building\",\"other\"))) AS ?bucket) } GROUP BY ?bucket"
run "Fictional locations (no coords) with a real analog (P1074)" "SELECT (COUNT(DISTINCT ?l) AS ?fictional) (COUNT(DISTINCT ?r) AS ?withAnalog) WHERE {
  $G ; wdt:P840 ?l . FILTER NOT EXISTS{?l wdt:P625 ?c} OPTIONAL{?l wdt:P1074 ?r . ?r wdt:P625 ?rc} }"
