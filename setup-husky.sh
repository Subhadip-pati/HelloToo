#!/bin/bash
# Setup Husky and lint-staged for code quality checks

echo "Installing husky and lint-staged..."
npm install --save-dev husky lint-staged

echo "Initializing Husky..."
npx husky install

echo "Creating pre-commit hook..."
cat > .husky/pre-commit << 'EOF'
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npx lint-staged
EOF

# Make the pre-commit hook executable (for Unix-like systems)
chmod +x .husky/pre-commit

echo "✅ Husky setup completed successfully!"
echo ""
echo "Configuration details:"
echo "- Husky is initialized in .husky directory"
echo "- Pre-commit hook created to run lint-staged"
echo "- lint-staged config added to package.json"
echo ""
echo "Your lint-staged rules:"
echo "  Frontend: frontend/**/*.{ts,tsx,js} → eslint --fix, prettier --write"
echo "  Backend:  backend/**/*.{ts,js} → eslint --fix, prettier --write"
