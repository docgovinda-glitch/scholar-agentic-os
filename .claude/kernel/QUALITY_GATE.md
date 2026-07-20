# QUALITY_GATE.md — Implementation Quality Checks

## Required Checks

- Build succeeds (`npm run build`)
- Tests pass (`npm test`)
- TypeScript strict mode
- No architectural violations
- Documentation updated
- No regressions

## Check Commands

```bash
npm run build   # Build verification
npm test        # Test suite
npm run lint    # TypeScript check
```

All gates must pass before task completion.