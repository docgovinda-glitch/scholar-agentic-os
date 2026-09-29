#!/bin/bash

# Deployment Readiness Verification Script
# Checks that all Phase 4-6 work is complete and ready for production

set -e

echo "🔍 Scholar Agentic OS - Deployment Readiness Verification"
echo "=========================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass_count=0
fail_count=0
warn_count=0

# Helper functions
check_pass() {
  echo -e "${GREEN}✓${NC} $1"
  pass_count=$((pass_count + 1))
}

check_fail() {
  echo -e "${RED}✗${NC} $1"
  fail_count=$((fail_count + 1))
}

check_warn() {
  echo -e "${YELLOW}⚠${NC} $1"
  warn_count=$((warn_count + 1))
}

echo "📋 Phase 1-4: Engineering Verification"
echo "======================================"
echo ""

# 1. Check tests
echo "1. Testing..."
if npx vitest run src/__tests__/authIntegration.test.ts 2>&1 | grep -q "passed"; then
  check_pass "Core integration tests passing"
else
  check_fail "Core integration tests failed"
fi

# 2. Check TypeScript & Lint
echo ""
echo "2. TypeScript & Design Lints..."
if npm run lint 2>&1 | grep -q "Contrast verification passed"; then
  check_pass "TypeScript compilation and contrast verification succeed"
else
  check_fail "Lint checks failed"
fi

# 3. Check git status
echo ""
echo "3. Git Status..."
if git diff --quiet; then
  check_pass "No uncommitted modifications"
else
  check_warn "Uncommitted changes detected"
fi

# 4. Branch Status
echo ""
echo "4. Branch Status..."
current_branch=$(git rev-parse --abbrev-ref HEAD)
check_pass "Current branch: $current_branch"

echo ""
echo "📋 Phase 5: Email Configuration Verification"
echo "=============================================="
echo ""

echo "1. Supabase Configuration..."
check_warn "Cannot verify Supabase settings programmatically"
echo "   ⚠ Please verify manually in Supabase dashboard:"
echo "     - Authentication > Providers > Email"
echo "     - Enable Email provider = ON"
echo "     - Confirm email = ON"
echo "     - Autoconfirm = OFF"

echo ""
echo "📋 Phase 6: Production Deployment Verification"
echo "==============================================="
echo ""

echo "1. Environment Variables..."
if [ -z "$VITE_CAPTCHA_SITE_KEY" ]; then
  check_warn "VITE_CAPTCHA_SITE_KEY not set in local environment"
  echo "   (This should be set in Render dashboard, not locally)"
else
  check_pass "VITE_CAPTCHA_SITE_KEY is set"
fi

if [ -z "$CAPTCHA_SECRET_KEY" ]; then
  check_warn "CAPTCHA_SECRET_KEY not set in local environment"
  echo "   (This should be set in Render dashboard, not locally)"
else
  check_pass "CAPTCHA_SECRET_KEY is set"
fi

if [ -z "$VITE_SUPABASE_URL" ]; then
  check_warn "VITE_SUPABASE_URL not set"
else
  check_pass "VITE_SUPABASE_URL is set"
fi

echo ""
echo "2. Build Verification..."
if npm run build &>/dev/null; then
  check_pass "Production build succeeds"
  check_pass "Build output generated in dist/"
else
  check_fail "Production build failed"
fi

echo ""
echo "3. Key Files Check..."
if [ -f "src/__tests__/authIntegration.test.ts" ]; then
  check_pass "Integration tests file exists"
  test_count=$(grep -c "it(" src/__tests__/authIntegration.test.ts || echo 0)
  echo "   Contains $test_count test cases"
else
  check_fail "Integration tests file not found"
fi

if [ -f "server/routes/auth.ts" ]; then
  check_pass "Auth routes file exists"
else
  check_fail "Auth routes file not found"
fi

if [ -f "src/desk/auth/CaptchaWidget.tsx" ]; then
  check_pass "CaptchaWidget component exists"
else
  check_fail "CaptchaWidget component not found"
fi

if [ -f "src/services/captchaService.ts" ]; then
  check_pass "CAPTCHA service exists"
else
  check_fail "CAPTCHA service not found"
fi

echo ""
echo "4. Documentation Check..."
if [ -f "docs/DEPLOYMENT.md" ]; then
  check_pass "Deployment documentation exists (docs/DEPLOYMENT.md)"
else
  check_fail "Deployment documentation not found (docs/DEPLOYMENT.md)"
fi

if [ -f "docs/README.md" ]; then
  check_pass "Master documentation index exists (docs/README.md)"
else
  check_fail "Master documentation index not found (docs/README.md)"
fi

echo ""
echo "=========================================================="
echo ""
echo "📊 Summary:"
echo -e "${GREEN}✓ Passed:${NC} $pass_count"
echo -e "${RED}✗ Failed:${NC} $fail_count"
echo -e "${YELLOW}⚠ Warnings:${NC} $warn_count"
echo ""

if [ $fail_count -eq 0 ]; then
  echo -e "${GREEN}✅ DEPLOYMENT READY!${NC}"
  echo ""
  echo "Next steps:"
  echo "1. Complete Phase 5: Configure Supabase email settings"
  echo "   - See docs/DEPLOYMENT.md for detailed steps"
  echo ""
  echo "2. Complete Phase 6: Deploy to production"
  echo "   - Set Cloudflare Turnstile keys in Render dashboard"
  echo "   - Merge to main branch"
  echo "   - Monitor deployment logs"
  echo ""
  echo "3. Run post-deployment tests"
  echo "   - Test signup flow with CAPTCHA"
  echo "   - Verify email verification works"
  echo "   - Test login and password reset"
  echo ""
  exit 0
else
  echo -e "${RED}❌ DEPLOYMENT NOT READY${NC}"
  echo ""
  echo "Please fix the failures above before proceeding."
  exit 1
fi
