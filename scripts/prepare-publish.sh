#!/bin/bash
# Replace workspace:* with actual versions for npm publish
# Usage: ./scripts/prepare-publish.sh

set -e

echo "Replacing workspace:* dependencies with actual versions..."

for pkg in packages/*/package.json; do
  # Replace "workspace:*" with the actual version from the target package
  content=$(cat "$pkg")
  
  # For each workspace dependency, find its version and replace
  for dep_pkg in packages/*/package.json; do
    dep_name=$(cat "$dep_pkg" | jq -r '.name')
    dep_version=$(cat "$dep_pkg" | jq -r '.version')
    
    # Replace "workspace:*" for this dependency
    content=$(echo "$content" | jq --arg name "$dep_name" --arg ver "^$dep_version" \
      'if .dependencies[$name] == "workspace:*" then .dependencies[$name] = $ver else . end')
  done
  
  echo "$content" | jq '.' > "$pkg"
  echo "  Updated: $pkg"
done

echo "Done. All workspace:* replaced with version ranges."
