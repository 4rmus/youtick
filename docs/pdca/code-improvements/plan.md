# Plan: YouTick Code Improvements

**Date**: 2025-12-06
**Objective**: Transform monolithic landing page into maintainable, performant component architecture

---

## Hypothesis

**Problem**:
- `page.tsx` is 602 lines of monolithic code
- Hardcoded Turkish text without i18n
- TypeScript `any` types reducing type safety
- No design system consistency
- Poor component reusability

**Approach**:
1. Extract i18n translations to existing translation system
2. Fix TypeScript type safety issues
3. Create design system constants for consistency
4. Extract reusable hooks (useCounter)
5. Break down page.tsx into 10+ focused components
6. Apply performance optimizations (memo, useCallback, lazy loading)

**Why This Approach**:
- Incremental refactoring reduces risk
- Foundation first (types, i18n, constants) enables component extraction
- Component extraction follows React best practices
- Performance optimizations applied after structure is solid

---

## Expected Outcomes

| Metric | Before | Target | Measurement |
|--------|--------|--------|-------------|
| Type Safety | 4 `any` types | 0 `any` types | TypeScript check |
| File Organization | 1 file, 602 lines | 10+ files, ~100 lines each | Line count |
| Code Reusability | Inline logic | Shared hooks/components | Import analysis |
| Maintainability Score | 4/10 | 9/10 | Subjective review |
| Test Coverage | Unknown | 80%+ (future) | Jest coverage |
| Build Performance | Baseline | Improved via memo/lazy | Build time |

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing functionality | High | Test after each component extraction |
| i18n integration issues | Medium | Use existing LanguageContext pattern |
| Performance regression | Low | Apply React.memo, measure before/after |
| Over-engineering | Medium | Keep components focused, avoid premature abstraction |

---

## Architecture Decisions

### Component Structure
```
components/landing/
├── Branding.tsx          ✅ Created
├── Navigation.tsx        ✅ Created
├── StatsSection.tsx      ✅ Created
├── HeroSection.tsx       ⏳ Pending
├── FeaturesSection.tsx   ⏳ Pending
├── ComparisonSection.tsx ⏳ Pending
├── UseCasesSection.tsx   ⏳ Pending
├── HowItWorksSection.tsx ⏳ Pending
├── CTASection.tsx        ⏳ Pending
└── LandingFooter.tsx     ⏳ Pending

components/discover/
└── DiscoverView.tsx      ⏳ Pending
```

### Shared Resources
```
lib/
├── constants.ts          ✅ Created (design system)
├── translations.ts       ✅ Extended (i18n)
└── utils.ts              ✅ Exists

hooks/
├── useCounter.ts         ✅ Created
├── useAllVideos.ts       ✅ Fixed types
└── useOwnedTokens.ts     ✅ Exists
```

---

## Implementation Phases

### Phase 1: Foundation ✅ Complete
- [x] Extend i18n translations
- [x] Fix TypeScript any types
- [x] Create design system constants
- [x] Extract useCounter hook

### Phase 2: Initial Components ✅ Complete
- [x] Branding component
- [x] Navigation component
- [x] StatsSection component

### Phase 3: Component Extraction 🔄 In Progress
- [ ] HeroSection
- [ ] FeaturesSection
- [ ] ComparisonSection
- [ ] UseCasesSection
- [ ] HowItWorksSection
- [ ] CTASection
- [ ] LandingFooter
- [ ] DiscoverView

### Phase 4: Refactoring ⏳ Pending
- [ ] Refactor page.tsx to use components
- [ ] Remove duplicated code
- [ ] Verify all functionality works

### Phase 5: Optimization ⏳ Pending
- [ ] Add useCallback for event handlers
- [ ] Add useMemo for computed values
- [ ] Implement lazy loading for below-fold sections
- [ ] Performance measurement

### Phase 6: Validation ⏳ Pending
- [ ] TypeScript compilation check
- [ ] ESLint validation
- [ ] Build test (next build)
- [ ] Manual UI testing (both languages)
- [ ] Responsive design check

---

## Success Criteria

1. ✅ Zero TypeScript `any` types
2. ✅ i18n fully integrated
3. 🔄 Component count: 10+ focused components
4. ⏳ page.tsx reduced to ~100 lines
5. ⏳ All components memoized
6. ⏳ Build succeeds without errors
7. ⏳ Both EN/TR languages work correctly
8. ⏳ Responsive design maintained

---

## Timeline

- **Foundation**: 30 minutes ✅ Complete
- **Initial Components**: 30 minutes ✅ Complete
- **Remaining Components**: 60 minutes 🔄 Current Phase
- **Refactoring**: 30 minutes ⏳ Next
- **Optimization**: 30 minutes ⏳ Next
- **Testing**: 30 minutes ⏳ Final

**Total Estimated**: ~3.5 hours
**Actual Progress**: ~1.5 hours (60% foundation complete)
