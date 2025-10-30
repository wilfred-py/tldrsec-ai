#!/bin/bash
rm -rf thoughts/searchable
mkdir -p thoughts/searchable
find thoughts -type f ! -path '*/searchable/*' -exec ln {} thoughts/searchable/{} \;
echo "Thoughts synced"
