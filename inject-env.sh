#!/usr/bin/env bash
# inject-env.sh
# Run by Netlify at build time to substitute env vars into static HTML files.
# Replaces the placeholder `window.__PT_ANON_KEY` with the literal anon key
# from the SUPABASE_ANON_KEY environment variable (set in Netlify UI).
#
# Files using the placeholder pattern:
#   const SUPABASE_ANON_KEY = window.__PT_ANON_KEY || '';
# Become:
#   const SUPABASE_ANON_KEY = '<actual key>';

set -euo pipefail

echo "→ inject-env.sh starting"

# ---- Sanity check: env var must be set ----
if [ -z "${SUPABASE_ANON_KEY:-}" ]; then
    echo "✗ ERROR: SUPABASE_ANON_KEY env var is not set."
    echo "  Set it in Netlify dashboard → Site settings → Environment variables."
    exit 1
fi

# ---- Sanity check: key must look like a JWT ----
if [[ ! "$SUPABASE_ANON_KEY" =~ ^eyJ ]] && [[ ! "$SUPABASE_ANON_KEY" =~ ^sb_publishable_ ]]; then
    echo "✗ ERROR: SUPABASE_ANON_KEY doesn't look like a Supabase key (should start with eyJ or sb_publishable_)."
    exit 1
fi

# ---- Count files we'll touch ----
FILES_WITH_PLACEHOLDER=$(grep -l "window.__PT_ANON_KEY" *.html 2>/dev/null || true)
if [ -z "$FILES_WITH_PLACEHOLDER" ]; then
    echo "  No HTML files contain the placeholder. Nothing to substitute."
    echo "→ inject-env.sh done (no-op)"
    exit 0
fi

COUNT=$(echo "$FILES_WITH_PLACEHOLDER" | wc -l)
echo "  Found $COUNT HTML file(s) with placeholder. Substituting…"

# ---- Substitute ----
# Use # as sed delimiter because the original line contains | (the JS OR operator).
# Escape any # in the key (unlikely but defensive).
ESCAPED_KEY=$(printf '%s' "$SUPABASE_ANON_KEY" | sed 's/#/\\#/g')

for f in $FILES_WITH_PLACEHOLDER; do
    # Replace `window.__PT_ANON_KEY || ''` with the literal quoted key
    sed -i.bak "s#window\.__PT_ANON_KEY || ''#'$ESCAPED_KEY'#g" "$f"
    rm -f "$f.bak"
    echo "    ✓ $f"
done

# ---- Verify nothing was missed ----
REMAINING=$(grep -l "window.__PT_ANON_KEY" *.html 2>/dev/null || true)
if [ -n "$REMAINING" ]; then
    echo "✗ WARNING: placeholder still present in:"
    echo "$REMAINING"
    exit 1
fi

echo "→ inject-env.sh complete: $COUNT file(s) updated"
