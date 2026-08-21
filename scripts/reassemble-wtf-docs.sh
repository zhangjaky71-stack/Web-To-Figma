#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

mkdir -p docs/baseline docs/archive

assemble() {
  local parts_dir="$1"
  local output="$2"
  local expected_lines="$3"
  local expected_sha="$4"

  mapfile -t parts < <(find "$parts_dir" -maxdepth 1 -type f -name '*.part' -print | LC_ALL=C sort)
  if [[ ${#parts[@]} -eq 0 ]]; then
    echo "No parts found in $parts_dir" >&2
    exit 1
  fi

  : > "$output"
  for part in "${parts[@]}"; do
    cat "$part" >> "$output"
  done

  local actual_lines
  actual_lines="$(wc -l < "$output" | tr -d ' ')"
  if [[ "$actual_lines" != "$expected_lines" ]]; then
    echo "Line-count mismatch for $output: expected $expected_lines, got $actual_lines" >&2
    exit 1
  fi

  local actual_sha
  actual_sha="$(sha256sum "$output" | awk '{print $1}')"
  if [[ "$actual_sha" != "$expected_sha" ]]; then
    echo "SHA-256 mismatch for $output" >&2
    echo "expected: $expected_sha" >&2
    echo "actual:   $actual_sha" >&2
    exit 1
  fi

  echo "OK  $output  lines=$actual_lines sha256=$actual_sha"
}

assemble \
  "docs/.wtf-parts/v2" \
  "docs/baseline/Web2Figma_W2F_Development_Implementation_Plan_V2_Baseline.md" \
  "3334" \
  "f731f4bef9590793bf12bb01a1fe98e9683bb266f682ce01df00b5f35fb0ddb8"

assemble \
  "docs/.wtf-parts/v1" \
  "docs/archive/Web2Figma_W2F_Development_Implementation_Plan_V1.md" \
  "5049" \
  "4f65c5fb5422ffd1fc394bdfe3ecfc0fe4bd34699bd73ae90064a5a112b64477"

echo "W2F .wtf-format documentation reassembled and verified."
