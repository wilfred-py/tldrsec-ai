#!/bin/bash

# create_worktree.sh - Create a new worktree for development work
# Usage: ./create_worktree.sh [--no-thoughts] [--open] [worktree_name] [base_branch]
# If no name provided, generates a unique human-readable one
# If no base branch provided, uses current branch
# --open: Open the worktree in Windsurf after creation

set -e  # Exit on any error


# Function to generate a unique worktree name
generate_unique_name() {
    local adjectives=("swift" "bright" "clever" "smooth" "quick" "clean" "sharp" "neat" "cool" "fast")
    local nouns=("fix" "task" "work" "dev" "patch" "branch" "code" "build" "test" "run")

    local adj=${adjectives[$RANDOM % ${#adjectives[@]}]}
    local noun=${nouns[$RANDOM % ${#nouns[@]}]}
    local timestamp=$(date +%H%M)

    echo "${adj}_${noun}_${timestamp}"
}

# Parse flags
INIT_THOUGHTS=true
OPEN_AFTER=false
while [[ $# -gt 0 ]]; do
    case $1 in
        --no-thoughts)
            INIT_THOUGHTS=false
            shift
            ;;
        --open)
            OPEN_AFTER=true
            shift
            ;;
        *)
            break
            ;;
    esac
done

# Get worktree name from parameter or generate one
WORKTREE_NAME=${1:-$(generate_unique_name)}

# Get base branch from second parameter or use current branch
BASE_BRANCH=${2:-$(git branch --show-current)}

# Get base directory name (should be 'humanlayer')
REPO_BASE_NAME=$(basename "$(pwd)")

if [ ! -z "$HUMANLAYER_WORKTREE_OVERRIDE_BASE" ]; then
    WORKTREE_DIR_NAME="${WORKTREE_NAME}"
    WORKTREES_BASE="${HUMANLAYER_WORKTREE_OVERRIDE_BASE}/${REPO_BASE_NAME}"
else
    WORKTREE_DIR_NAME="${WORKTREE_NAME}"
    WORKTREES_BASE="$HOME/wt/${REPO_BASE_NAME}"
fi

WORKTREE_PATH="${WORKTREES_BASE}/${WORKTREE_DIR_NAME}"

echo "🌳 Creating worktree: ${WORKTREE_NAME}"
echo "📁 Location: ${WORKTREE_PATH}"

# Check if worktrees base directory exists
if [ ! -d "$WORKTREES_BASE" ]; then
    echo "❌ Error: Directory $WORKTREES_BASE does not exist."
    echo "   Please create it first: mkdir -p $WORKTREES_BASE"
    exit 1
fi

# Check if worktree already exists
if [ -d "$WORKTREE_PATH" ]; then
    echo "❌ Error: Worktree directory already exists: $WORKTREE_PATH"
    exit 1
fi

# Display base branch info
echo "🔀 Creating from branch: ${BASE_BRANCH}"

# Create worktree (creates branch if it doesn't exist)
if git show-ref --verify --quiet "refs/heads/${WORKTREE_NAME}"; then
    echo "📋 Using existing branch: ${WORKTREE_NAME}"
    git worktree add "$WORKTREE_PATH" "$WORKTREE_NAME"
else
    echo "🆕 Creating new branch: ${WORKTREE_NAME}"
    git worktree add -b "$WORKTREE_NAME" "$WORKTREE_PATH" "$BASE_BRANCH"
fi

# Copy .claude directory if it exists
if [ -d ".claude" ]; then
    echo "📋 Copying .claude directory..."
    cp -r .claude "$WORKTREE_PATH/"
fi

# Copy .env file from main branch if it exists
if [ -f ".env" ]; then
    echo "🔧 Copying .env file from main..."
    cp .env "$WORKTREE_PATH/"
fi

# Sync latest progress files from main branch
echo "📋 Syncing latest progress files from main..."
cd "$WORKTREE_PATH"

# Get latest PROGRESS.md from main branch
if git show main:PROGRESS.md > /dev/null 2>&1; then
    git show main:PROGRESS.md > PROGRESS.md
    echo "   ✓ Updated PROGRESS.md"
else
    echo "   ⚠️  PROGRESS.md not found in main branch"
fi

# Get latest TIMELINE.md from main branch  
if git show main:TIMELINE.md > /dev/null 2>&1; then
    git show main:TIMELINE.md > TIMELINE.md
    echo "   ✓ Updated TIMELINE.md"
else
    echo "   ⚠️  TIMELINE.md not found in main branch"
fi

cd - > /dev/null

# Change to worktree directory
cd "$WORKTREE_PATH"

echo "🔧 Setting up worktree dependencies..."
if ! npm install; then
    echo "❌ Setup failed. Cleaning up worktree..."
    cd - > /dev/null
    git worktree remove --force "$WORKTREE_PATH"
    git branch -D "$WORKTREE_NAME" 2>/dev/null || true
    echo "❌ Not allowed to create worktree from a branch that isn't passing setup."
    exit 1
fi

# echo "🧪 Verifying worktree with checks and tests..."
# temp_output=$(mktemp)
# if make check test > "$temp_output" 2>&1; then
#     rm "$temp_output"
#     echo "✅ All checks and tests pass!"
# else
#     cat "$temp_output"
#     rm "$temp_output"
#     echo "❌ Checks and tests failed. Cleaning up worktree..."
#     cd - > /dev/null
#     git worktree remove --force "$WORKTREE_PATH"
#     git branch -D "$WORKTREE_NAME" 2>/dev/null || true
#     echo "❌ Not allowed to create worktree from a branch that isn't passing checks and tests."
#     exit 1
# fi

# Skip humanlayer-specific thoughts initialization for Claude Code
if [ "$INIT_THOUGHTS" = true ]; then
    echo "✅ Claude Code context isolated with copied .claude directory"
fi

# Return to original directory
cd - > /dev/null

echo "✅ Worktree created successfully!"
echo "📁 Path: ${WORKTREE_PATH}"
echo "🔀 Branch: ${WORKTREE_NAME}"

# Open in Windsurf if --open flag was provided
if [ "$OPEN_AFTER" = true ]; then
    if command -v windsurf &> /dev/null; then
        WINDSURF_CMD="windsurf"
    elif [ -f "/Applications/Windsurf.app/Contents/MacOS/Windsurf" ]; then
        WINDSURF_CMD="/Applications/Windsurf.app/Contents/MacOS/Windsurf"
    else
        echo "⚠️  Windsurf not found. Skipping auto-open."
        WINDSURF_CMD=""
    fi

    if [ -n "$WINDSURF_CMD" ]; then
        echo "🚀 Opening worktree in Windsurf..."
        "$WINDSURF_CMD" --new-window "$WORKTREE_PATH" &
    fi
fi

echo ""
echo "To work in this worktree:"
echo "  cd ${WORKTREE_PATH}"
echo ""
echo "To remove this worktree later:"
echo "  git worktree remove ${WORKTREE_PATH}"
echo "  git branch -D ${WORKTREE_NAME}"