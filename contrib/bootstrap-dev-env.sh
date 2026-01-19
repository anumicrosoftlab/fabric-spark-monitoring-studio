#!/bin/bash
#
#
#       Sets up a dev env with all pre-reqs. This script is idempotent, it will
#       only attempt to install dependencies, if not exists.   
#
# ---------------------------------------------------------------------------------------
#

set -e
set -m

export NODE_VERSION=25.1.0
export NVM_VERSION=v0.39.5

echo ""
echo "┌───────────────────────────────┐"
echo "│ Installing VS Code extensions │"
echo "└───────────────────────────────┘"
echo ""

code --install-extension github.copilot
code --install-extension eamodio.gitlens

echo ""
echo "┌────────────────┐"
echo "│ Installing NVM │"
echo "└────────────────┘"
echo ""

# nvm doesn't show up without sourcing this script. This is done in bashrc,
# but does not stick in the subshell for scripts.
#
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
if ! command -v nvm &> /dev/null; then
    echo "nvm not found, installing..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh 2>&1 | bash
    # Load nvm again after install
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
    [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
else
    echo "nvm already installed"
fi

echo ""
echo "┌──────────────────────────────────────┐"
echo "│ Configuring PATH for WSL npm/node   │"
echo "└──────────────────────────────────────┘"
echo ""

if ! grep -q "Remove Windows npm/node from PATH" ~/.bashrc; then
    echo "Adding PATH filter to ~/.bashrc..."
    cat >> ~/.bashrc << 'EOF'

PATH=$(echo "$PATH" | tr ':' '\n' | grep -v "/mnt/c/Program Files/nodejs" | grep -v "AppData/Roaming/npm" | tr '\n' ':' | sed 's/:$//')
export PATH
EOF
    PATH=$(echo "$PATH" | tr ':' '\n' | grep -v "/mnt/c/Program Files/nodejs" | grep -v "AppData/Roaming/npm" | tr '\n' ':' | sed 's/:$//')
    export PATH
else
    echo "PATH filter already configured in ~/.bashrc"
fi

sudo apt-get update && sudo apt-get install -y libatomic1 tree

echo ""
echo "┌─────────────────┐"
echo "│ Installing Node │"
echo "└─────────────────┘"
echo ""

nvm install $NODE_VERSION

echo ""
echo "┌──────────┐"
echo "│ Versions │"
echo "└──────────┘"
echo ""

echo "nvm version: " $(nvm --version)
echo "node version: " $(node --version)
echo "npm version: " $(npm --version)