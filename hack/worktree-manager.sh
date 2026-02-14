#!/bin/bash

# worktree-manager.sh - Unified worktree management CLI
# Usage: ./hack/worktree-manager.sh

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Function to generate a unique worktree name
generate_unique_name() {
    local adjectives=("swift" "bright" "clever" "smooth" "quick" "clean" "sharp" "neat" "cool" "fast")
    local nouns=("fix" "task" "work" "dev" "patch" "branch" "code" "build" "test" "run")

    local adj=${adjectives[$RANDOM % ${#adjectives[@]}]}
    local noun=${nouns[$RANDOM % ${#nouns[@]}]}
    local timestamp=$(date +%H%M)

    echo "${adj}_${noun}_${timestamp}"
}

# Get the Windsurf command
get_windsurf_cmd() {
    if command -v windsurf &> /dev/null; then
        echo "windsurf"
    elif [ -f "/Applications/Windsurf.app/Contents/MacOS/Windsurf" ]; then
        echo "/Applications/Windsurf.app/Contents/MacOS/Windsurf"
    else
        echo ""
    fi
}

echo -e "${CYAN}🌳 Git Worktree Manager${NC}\n"

# Get all worktrees
worktrees=$(git worktree list --porcelain)

# Parse worktrees into arrays
declare -a worktree_paths
declare -a worktree_branches

while IFS= read -r line; do
    if [[ $line == worktree* ]]; then
        path="${line#worktree }"
        worktree_paths+=("$path")
    elif [[ $line == branch* ]]; then
        branch="${line#branch refs/heads/}"
        worktree_branches+=("$branch")
    fi
done <<< "$worktrees"

# Display existing worktrees
if [ ${#worktree_paths[@]} -gt 1 ]; then
    echo -e "${GREEN}Existing worktrees:${NC}"
    for i in "${!worktree_paths[@]}"; do
        if [ $i -eq 0 ]; then
            echo -e "  ${BLUE}[Main]${NC} ${worktree_branches[$i]}"
        else
            echo -e "  ${BLUE}[$i]${NC} ${worktree_branches[$i]}"
        fi
        echo -e "      ${worktree_paths[$i]}"
    done
    echo ""
fi

# Main menu
echo -e "${YELLOW}What would you like to do?${NC}"
echo "  1. Create a new worktree"
echo "  2. Open existing worktree(s)"
echo "  3. Clean up worktrees"
echo "  4. Exit"
echo ""

read -p "Enter your choice (1-4): " choice

case $choice in
    1)
        # Create new worktree
        echo ""
        echo -e "${CYAN}📝 Create New Worktree${NC}"
        echo ""
        echo "Enter a name for your new worktree (or press Enter for auto-generated name):"
        read -p "> " user_input

        if [ -z "$user_input" ]; then
            WORKTREE_NAME=$(generate_unique_name)
            echo "📝 Using auto-generated name: $WORKTREE_NAME"
        else
            WORKTREE_NAME="$user_input"
        fi

        # Ask for base branch
        CURRENT_BRANCH=$(git branch --show-current)
        echo ""
        echo "Enter base branch (or press Enter to use current: $CURRENT_BRANCH):"
        read -p "> " base_input

        if [ -z "$base_input" ]; then
            BASE_BRANCH="$CURRENT_BRANCH"
        else
            BASE_BRANCH="$base_input"
        fi

        # Execute create_worktree.sh
        echo ""
        exec bash "$(dirname "$0")/create_worktree.sh" --no-thoughts "$WORKTREE_NAME" "$BASE_BRANCH"
        ;;

    2)
        # Open existing worktrees
        WINDSURF_CMD=$(get_windsurf_cmd)

        if [ -z "$WINDSURF_CMD" ]; then
            echo -e "${YELLOW}Warning: Windsurf command not found. Please install Windsurf or update the path.${NC}"
            exit 1
        fi

        if [ ${#worktree_paths[@]} -le 1 ]; then
            echo -e "${YELLOW}No additional worktrees found. Only main worktree exists.${NC}"
            exit 0
        fi

        echo ""
        echo -e "${YELLOW}Open worktrees:${NC}"
        echo "  a. Open all worktrees"
        echo "  s. Select specific worktrees"
        echo ""
        read -p "Enter your choice (a/s): " open_choice

        case $open_choice in
            a|A)
                echo -e "\n${GREEN}Opening all worktrees...${NC}"
                for i in "${!worktree_paths[@]}"; do
                    if [ $i -eq 0 ]; then
                        echo -e "  ${BLUE}Skipping main worktree${NC}"
                        continue
                    fi
                    echo -e "  ${GREEN}Opening:${NC} ${worktree_branches[$i]}"
                    "$WINDSURF_CMD" --new-window "${worktree_paths[$i]}" &
                    sleep 1
                done
                echo -e "\n${GREEN}✓ Done!${NC}"
                ;;
            s|S)
                echo ""
                read -p "Enter worktree numbers to open (space-separated, e.g., '2 3'): " selections

                for num in $selections; do
                    idx=$num
                    if [ $idx -gt 0 ] && [ $idx -lt ${#worktree_paths[@]} ]; then
                        echo -e "  ${GREEN}Opening:${NC} ${worktree_branches[$idx]}"
                        "$WINDSURF_CMD" --new-window "${worktree_paths[$idx]}" &
                        sleep 1
                    else
                        echo -e "  ${YELLOW}Invalid selection: $num${NC}"
                    fi
                done
                echo -e "\n${GREEN}✓ Done!${NC}"
                ;;
            *)
                echo -e "${YELLOW}Invalid choice${NC}"
                exit 1
                ;;
        esac
        ;;

    3)
        # Clean up worktrees
        if [ ${#worktree_paths[@]} -le 1 ]; then
            echo -e "${YELLOW}No additional worktrees to clean up.${NC}"
            exit 0
        fi

        echo ""
        echo -e "${YELLOW}Select worktrees to clean up (space-separated, e.g., '1 2'):${NC}"
        read -p "Enter worktree numbers: " selections

        for num in $selections; do
            idx=$num
            if [ $idx -le 0 ] || [ $idx -ge ${#worktree_paths[@]} ]; then
                echo -e "  ${YELLOW}Invalid selection: $num${NC}"
                continue
            fi

            worktree_path="${worktree_paths[$idx]}"
            branch_name="${worktree_branches[$idx]}"

            echo ""
            echo -e "${YELLOW}Cleaning up:${NC} $branch_name"
            echo -e "${YELLOW}Path:${NC} $worktree_path"

            # Remove the worktree
            if git worktree remove --force "$worktree_path" 2>/dev/null; then
                echo -e "  ${GREEN}✓ Worktree removed${NC}"
            else
                echo -e "  ${YELLOW}Warning: Could not remove worktree, trying manual cleanup...${NC}"
                rm -rf "$worktree_path" 2>/dev/null || true
            fi

            # Ask about branch deletion
            read -p "Delete branch '$branch_name'? (y/N) " -n 1 -r
            echo ""
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                if git branch -D "$branch_name" 2>/dev/null; then
                    echo -e "  ${GREEN}✓ Branch deleted${NC}"
                else
                    echo -e "  ${YELLOW}Branch might not exist or already deleted${NC}"
                fi
            else
                echo -e "  ${BLUE}Branch kept${NC}"
            fi
        done

        # Prune worktree references
        echo ""
        echo "Pruning worktree references..."
        git worktree prune
        echo -e "\n${GREEN}✓ Cleanup complete!${NC}"
        ;;

    4)
        echo "Exiting..."
        exit 0
        ;;

    *)
        echo -e "${YELLOW}Invalid choice${NC}"
        exit 1
        ;;
esac
