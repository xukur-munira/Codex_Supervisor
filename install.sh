#!/bin/bash
# Codex Supervisor - Installation Script
# External Supervisor for OpenAI Codex CLI
# Usage: ./install.sh [--with-redis]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$HOME/.codex-supervisor"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo_info() { echo "${GREEN}[INFO]${NC} $1"; }
echo_warn() { echo "${YELLOW}[WARN]${NC} $1"; }
echo_error() { echo "${RED}[ERROR]${NC} $1"; }
echo_section() { echo "${BLUE}$1${NC}"; }

# Check Node.js version
check_node() {
    if ! command -v node &> /dev/null; then
        echo_error "Node.js is not installed. Please install Node.js 20+ first."
        exit 1
    fi

    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 20 ]; then
        echo_error "Node.js version must be 20+. Current: $(node -v)"
        exit 1
    fi
    echo_info "Node.js version: $(node -v)"
}

# Check Codex CLI
check_codex() {
    if ! command -v codex &> /dev/null; then
        echo_warn "OpenAI Codex CLI not found. You can install it later:"
        echo "       npm install -g @openai/codex"
    else
        echo_info "OpenAI Codex CLI found"
    fi
}

# Install dependencies and build
build_project() {
    echo_info "Installing dependencies..."
    cd "$SCRIPT_DIR"
    npm install

    echo_info "Building project..."
    npm run build

    echo_info "Build complete!"
}

# Link CLI command
link_cli() {
    echo_info "Linking CLI command globally..."
    npm link || echo_warn "npm link failed. You can still run via: node dist/index.js"
    echo_info "CLI command 'codex-supervisor' is now available"
}

# Create data directory
create_data_dir() {
    if [ ! -d "$DATA_DIR" ]; then
        mkdir -p "$DATA_DIR"
        mkdir -p "$DATA_DIR/projects"
        mkdir -p "$DATA_DIR/tasks"
        mkdir -p "$DATA_DIR/checkpoints"
        mkdir -p "$DATA_DIR/logs"
        echo_info "Created data directory: $DATA_DIR"
    fi
}

# Main installation
main() {
    WITH_REDIS="false"

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --with-redis)
                WITH_REDIS="true"
                shift
                ;;
            *)
                echo_error "Unknown option: $1"
                echo "Usage: ./install.sh [--with-redis]"
                exit 1
                ;;
        esac
    done

    echo_section "============================================"
    echo_section " Codex Supervisor Installation"
    echo_section " External Supervisor for OpenAI Codex CLI"
    echo_section "============================================"
    echo ""

    check_node
    check_codex
    build_project
    link_cli
    create_data_dir

    echo ""
    echo_section "=========================================="
    echo_info "Installation complete!"
    echo_section "=========================================="
    echo ""

    if [ "$WITH_REDIS" = "true" ]; then
        echo_info "Redis mode enabled. Make sure Redis is running:"
        echo "    redis-cli ping"
        echo ""
    else
        echo_info "Using in-memory queue (Redis not configured)"
        echo_info "To enable Redis, run: ./install.sh --with-redis"
        echo ""
    fi

    echo_info "Set environment variables (optional):"
    echo "    export CODEX_DATA_DIR=$DATA_DIR"
    echo "    export CODEX_LOG_LEVEL=info"
    if [ "$WITH_REDIS" = "true" ]; then
        echo "    export CODEX_REDIS_URL=redis://localhost:6379"
    fi
    echo ""

    echo_section "Quick Start:"
    echo ""
    echo_info "Start REST API server:"
    echo "    codex-supervisor serve"
    echo "    codex-supervisor serve --port 8080"
    echo ""
    echo_info "Create a new project:"
    echo "    codex-supervisor run -d ./my-project -D \"Build a web app\""
    echo ""
    echo_info "Check project status:"
    echo "    codex-supervisor status --project-id PROJECT_ID"
    echo "    codex-supervisor list"
    echo ""
    echo_section "REST API Endpoints (when serving):"
    echo "  POST /api/projects              - Create project"
    echo "  GET  /api/projects              - List projects"
    echo "  GET  /api/projects/:id          - Get project status"
    echo "  POST /api/projects/:id/tasks    - Decompose tasks"
    echo "  POST /api/projects/:id/workers  - Spawn Codex worker"
    echo "  POST /api/projects/:id/confirm  - Supervisor confirm"
    echo "  POST /api/projects/:id/finalize - Finalize project"
    echo ""
}

main "$@"