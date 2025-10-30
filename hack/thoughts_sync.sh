#!/usr/bin/env bash
set -euo pipefail

# Create thoughts sync mechanism for the codebase
# This creates hard links in thoughts/searchable/ for better searching

echo "Syncing thoughts directory..."

# Create searchable directory if it doesn't exist
mkdir -p thoughts/searchable

# Remove existing hard links to avoid duplicates
find thoughts/searchable -type f -delete 2>/dev/null || true

# Create hard links for all files in thoughts/ (excluding searchable itself)
find thoughts/ -type f ! -path '*/searchable/*' | while read -r file; do
    # Get the relative path from thoughts/
    rel_path="${file#thoughts/}"
    # Create directory structure in searchable
    mkdir -p "thoughts/searchable/$(dirname "$rel_path")"
    # Create hard link
    ln "$file" "thoughts/searchable/$rel_path" 2>/dev/null || cp "$file" "thoughts/searchable/$rel_path"
done

echo "Thoughts directory synced successfully"
echo "Files indexed: $(find thoughts/searchable -type f | wc -l)"