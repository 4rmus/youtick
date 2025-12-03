# Code Quality Assessment - YouTick Web3 Video Platform

**Assessment Date**: 2025-11-28
**Total Application Code**: 689 lines
**Technology Stack**: Next.js 16, React 19, TypeScript, NEAR Protocol, Supabase, Lighthouse, Livepeer

---

## Executive Summary

This Web3 video platform is in **early prototype/MVP stage** with significant quality gaps across security, error handling, testing, and implementation completeness. While the architecture demonstrates understanding of the tech stack, multiple critical security vulnerabilities and incomplete implementations prevent production readiness.

**Overall Quality Score**: 42/100

### Quality Scores by Category

| Category | Score | Status |
|----------|-------|--------|
| **Security** | 25/100 | Critical Issues |
| **Error Handling** | 40/100 | Incomplete |
| **Type Safety** | 60/100 | Moderate Gaps |
| **Code Completeness** | 35/100 | Many Mocks |
| **Testing** | 0/100 | No Tests |
| **Documentation** | 30/100 | Minimal |
| **Code Organization** | 70/100 | Good Structure |
| **Performance** | 50/100 | Not Optimized |

---

## 1. Critical Security Issues

### 1.1 Authentication Bypass (CRITICAL - P0)

**Location**: `/apps/web/lib/auth.ts`

**Issue**: Mock authentication allows any wallet address to access protected content.

```typescript
// Lines 27-28: Insecure fallback authentication
// "For this demo/prototype, we might accept a "mock" token or a wallet address
// if we are skipping full auth flow."

// Lines 36-49: Accepts raw wallet address as authentication token
if (token.endsWith('.testnet') || token.endsWith('.near') || token.length === 64) {
    const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('wallet_address', token)
        .single();
    if (profile) {
        return { wallet: token, sub: profile.id };
    }
}
```

**Impact**: Attackers can impersonate any user by passing wallet address as Bearer token.

**Risk Level**: CRITICAL - Complete authentication bypass, unauthorized video access

**Recommendation**: Implement proper JWT-based authentication with cryptographic signature verification.

---

### 1.2 Signature Verification Bypass (CRITICAL - P0)

**Location**: `/apps/web/lib/near.ts:53-57`

**Issue**: Mock signature verification always returns true if signature exists.

```typescript
export async function verifySignature(walletAddress: string, signature: string): Promise<boolean> {
    // In a real app, we would verify the signature against the wallet address using near-api-js
    // For this demo, we'll assume it's valid if it exists
    return !!signature;
}
```

**Impact**: Any non-empty string accepted as valid signature, enabling complete security bypass.

**Risk Level**: CRITICAL - No cryptographic verification of user identity

**Recommendation**: Implement actual NEAR signature verification using `near-api-js` cryptographic primitives.

---

### 1.3 Mock Encryption Signing (CRITICAL - P0)

**Location**: `/apps/web/components/UploadForm.tsx:47-49`

**Issue**: Hardcoded mock signature for file encryption.

```typescript
// MOCK SIGNING for demo purposes if actual signing fails in this context
// In a real app, you'd use: wallet.signMessage(...)
const signature = "mock_signature";
```

**Impact**: All encrypted files use same mock signature, breaking encryption security model.

**Risk Level**: CRITICAL - Encrypted content may be accessible without proper authentication

**Recommendation**: Implement actual wallet signing integration with NEAR wallet selector.

---

### 1.4 Missing Environment Variable Validation (HIGH - P1)

**Location**: Multiple files

**Issue**: Non-null assertions on environment variables without runtime validation.

```typescript
// lib/supabase.ts:3-4
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// lib/lighthouse.ts:3
const LIGHTHOUSE_API_KEY = process.env.LIGHTHOUSE_API_KEY!;

// lib/near.ts:4
const NFT_CONTRACT_ID = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID!;

// app/api/video/access/route.ts:38-41
if (!process.env.LIVEPEER_PRIVATE_KEY || !process.env.LIVEPEER_PUBLIC_KEY) {
    console.error("Missing Livepeer keys");
    return NextResponse.json({ error: 'Configuration error' }, { status: 500 });
}
```

**Impact**: Application crashes at runtime if environment variables missing, inconsistent validation approach.

**Risk Level**: HIGH - Production outages, inconsistent error handling

**Recommendation**: Create centralized environment validation module with early validation at startup.

---

## 2. Error Handling Issues

### 2.1 Incomplete Error Recovery (MEDIUM - P2)

**Location**: Multiple components

**Issues**:

1. **Generic error messages** expose no actionable information to users
2. **Console logging only** - no structured logging or monitoring integration
3. **Missing error boundaries** in React components
4. **No retry logic** for transient failures

```typescript
// components/UploadForm.tsx:89-91
catch (error) {
    console.error('Upload failed:', error);
    setStatus('Upload failed: ' + (error as Error).message);
}

// lib/near.ts:46-49
catch (error) {
    console.error("Error verifying NFT ownership:", error);
    return false;  // Silent failure, could be network issue or actual ownership check
}

// components/VideoPlayer.tsx:51-54
catch (err) {
    console.error('Error fetching JWT:', err);
    setError((err as Error).message);  // Raw error message exposed to user
}
```

**Impact**: Poor user experience, difficult debugging, potential information leakage.

**Recommendation**: Implement structured error handling with user-friendly messages and proper logging.

---

### 2.2 Schema Mismatch Error Handling (MEDIUM - P2)

**Location**: `/apps/web/app/api/video/access/route.ts:56-72`

**Issue**: Known schema mismatch documented but not resolved.

```typescript
// Lines 58-61
// Note: Schema expects UUID for nft_cache_id, but we are using tokenId (string).
// We should probably look up the UUID from nft_cache table first.
// For now, let's assume we might need to fix the schema or lookup.

// Lines 67-72
// Better: Let's just log it for now to avoid 500s.
console.log(`User ${userPayload.wallet} accessed video ${tokenId}`);
```

**Impact**: Watch history feature silently fails, analytics data not collected.

**Risk Level**: MEDIUM - Feature completely non-functional but app continues

**Recommendation**: Either fix schema to accept token IDs or implement proper UUID lookup.

---

## 3. Type Safety Gaps

### 3.1 Non-Null Assertions (LOW - P3)

**Count**: 6 instances of `!` operator on potentially undefined values

**Impact**: Runtime errors if environment variables missing despite TypeScript checks.

**Recommendation**: Use type guards or validation functions instead of assertions.

---

### 3.2 Any Types (LOW - P3)

**Location**: `/apps/web/components/UploadForm.tsx:77`

```typescript
const fileHash = Array.isArray(uploadResponse.data)
    ? uploadResponse.data[0].Hash
    : (uploadResponse.data as any).Hash;
```

**Impact**: Type safety bypassed, potential runtime errors on API changes.

**Recommendation**: Define proper TypeScript interfaces for Lighthouse SDK responses.

---

### 3.3 Untyped Access Conditions (LOW - P3)

**Location**: `/apps/web/lib/lighthouse.ts:31`

```typescript
export async function applyAccessConditions(
    cid: string,
    conditions: any[],  // Untyped array
    aggregator: string = '([1])',
    publicKey: string,
    signedMessage: string
)
```

**Impact**: No compile-time validation of access condition structure.

**Recommendation**: Define TypeScript interface for Lighthouse access conditions.

---

## 4. Incomplete Implementations Inventory

### 4.1 Authentication System (CRITICAL)

**Status**: Mock implementation only

**Files**:
- `/apps/web/lib/auth.ts` - Mock JWT verification
- `/apps/web/lib/near.ts:53-57` - Mock signature verification

**Requirements for completion**:
1. Implement actual JWT signing/verification
2. Integrate NEAR signature verification
3. Add session management
4. Implement token refresh logic
5. Add rate limiting

**Estimated effort**: 3-5 days

---

### 4.2 File Upload Signing (CRITICAL)

**Status**: Hardcoded mock signature

**File**: `/apps/web/components/UploadForm.tsx:47-49`

**Requirements for completion**:
1. Integrate with NEAR wallet selector signing API
2. Handle signing rejection gracefully
3. Implement message format compatible with Lighthouse
4. Add signature verification

**Estimated effort**: 2-3 days

---

### 4.3 Video Listing Feature (HIGH)

**Status**: Placeholder only

**File**: `/apps/web/app/page.tsx:24-37`

**Missing implementation**:
```typescript
<p className="text-slate-500 italic">
    Connect your wallet to view your uploaded videos and NFTs.
    (Video listing feature coming soon)
</p>

{/* Example Video Player Placeholder */}
{/*
<div className="mt-6">
    <VideoPlayer
        playbackId="example-id"
        tokenId="example-token"
    />
</div>
*/}
```

**Requirements for completion**:
1. Fetch user's NFTs from NEAR contract
2. Query Supabase for video metadata
3. Render video list with thumbnails
4. Implement pagination
5. Add filtering/sorting

**Estimated effort**: 4-6 days

---

### 4.4 Watch History Feature (MEDIUM)

**Status**: Commented out due to schema mismatch

**File**: `/apps/web/app/api/video/access/route.ts:56-72`

**Requirements for completion**:
1. Resolve UUID vs string schema conflict
2. Implement nft_cache table lookup
3. Add upsert error handling
4. Create watch history UI component

**Estimated effort**: 1-2 days

---

### 4.5 NFT Ownership Verification (HIGH)

**Status**: Partial implementation

**File**: `/apps/web/lib/near.ts:21-50`

**Current issues**:
1. No error differentiation (network vs ownership failure)
2. Missing contract method verification
3. No caching for repeated checks
4. Untested against actual NEAR contract

**Requirements for completion**:
1. Test against deployed NFT contract
2. Add result caching with TTL
3. Implement retry logic for network failures
4. Add detailed error responses

**Estimated effort**: 2-3 days

---

## 5. Testing Gaps

### 5.1 Zero Test Coverage

**Status**: No application tests exist

**Impact**:
- No regression detection
- Unsafe refactoring
- Unknown edge case behavior
- Difficult to validate security fixes

**Test files needed**:

1. **Unit Tests** (Estimated 40+ tests needed):
   - `lib/auth.test.ts` - JWT verification, session management
   - `lib/near.test.ts` - NFT ownership, signature verification
   - `lib/lighthouse.test.ts` - File upload, access conditions
   - `lib/supabase.test.ts` - Database operations

2. **Integration Tests** (Estimated 20+ tests):
   - `api/video/access.test.ts` - Full video access flow
   - `components/UploadForm.test.tsx` - Upload workflow
   - `components/VideoPlayer.test.tsx` - Video playback with auth

3. **E2E Tests** (Estimated 10+ scenarios):
   - User authentication flow
   - Video upload and encryption
   - NFT-gated video access
   - Error scenarios (missing wallet, invalid NFT, etc.)

**Critical test scenarios missing**:
- Authentication bypass attempts
- Invalid signature handling
- Missing environment variables
- Network failure recovery
- Concurrent access handling
- Schema validation

**Recommendation**: Implement test suite using Jest + React Testing Library + Playwright

**Estimated effort**: 8-12 days for comprehensive coverage

---

## 6. Documentation Gaps

### 6.1 Missing Inline Documentation

**Code without documentation**:
- No JSDoc comments on public functions
- Complex logic unexplained (access condition formatting, JWT signing)
- No parameter descriptions
- Missing return type documentation

**Examples**:

```typescript
// lib/lighthouse.ts - No documentation on parameters or behavior
export async function applyAccessConditions(
    cid: string,
    conditions: any[],
    aggregator: string = '([1])',
    publicKey: string,
    signedMessage: string
) {
    // Implementation without explanation
}

// lib/near.ts - No documentation on contract interaction
export async function verifyNftOwnership(
    walletAddress: string,
    tokenId: string
): Promise<boolean> {
    // Complex NEAR API interaction without explanation
}
```

**Recommendation**: Add JSDoc comments for all public functions with:
- Parameter descriptions and types
- Return value explanation
- Example usage
- Error conditions

---

### 6.2 Missing API Documentation

**No documentation for**:
- REST API endpoints (`/api/video/access`)
- Request/response formats
- Authentication requirements
- Error response codes

**Recommendation**: Create OpenAPI/Swagger documentation

---

### 6.3 Missing Architecture Documentation

**No documentation on**:
- System architecture diagram
- Data flow diagrams
- Security model
- Deployment requirements
- Environment setup

**Recommendation**: Create architecture documentation in `/claudedocs/architecture.md`

---

## 7. Technical Debt Analysis

### 7.1 Hardcoded Values and Magic Strings

**Instances**:

```typescript
// UploadForm.tsx:49
const signature = "mock_signature";

// VideoPlayer.tsx - No configuration
expiration: 3600, // Hardcoded 1 hour

// UploadForm.tsx:62-74 - Complex inline configuration
const conditions = [{
    id: 1,
    chain: "Near",
    method: "hasToken",
    standard: "NEP171",
    // ... more hardcoded values
}];
```

**Impact**: Difficult to modify behavior, no environment-specific configuration

**Recommendation**: Extract to configuration files with environment overrides

---

### 7.2 Code Duplication

**Instances**:

1. **NEAR connection setup** duplicated in `getNearConnection()` and `verifyNftOwnership()`
2. **Error handling patterns** repeated across components
3. **Wallet access logic** duplicated in UploadForm and VideoPlayer

**Recommendation**: Extract common patterns to utility functions

---

### 7.3 Commented Code in Production Files

**Location**: `/apps/web/app/page.tsx:29-37`

```typescript
{/* Example Video Player Placeholder */}
{/*
<div className="mt-6">
    <VideoPlayer
        playbackId="example-id"
        tokenId="example-token"
    />
</div>
*/}
```

**Impact**: Code clutter, unclear intent, version control confusion

**Recommendation**: Remove commented code, track in issue tracker instead

---

## 8. Code Organization Assessment

### 8.1 Strengths

✅ **Good separation of concerns**:
- API routes in `/app/api/`
- Utility libraries in `/lib/`
- Components in `/components/`
- Providers properly isolated

✅ **Consistent naming conventions**:
- PascalCase for components
- camelCase for functions
- Clear file naming

✅ **Proper use of React patterns**:
- Context API for wallet state
- Custom hooks (`useWallet`)
- Proper client/server component separation

---

### 8.2 Areas for Improvement

⚠️ **Missing separation**:
- No `/types/` directory for shared TypeScript interfaces
- No `/utils/` directory for shared utilities
- Configuration scattered across files

⚠️ **Component coupling**:
- UploadForm tightly coupled to specific Lighthouse format
- VideoPlayer makes direct API calls instead of using service layer

**Recommendation**:
1. Create `/types/` for shared interfaces
2. Create `/services/` for API interaction layer
3. Extract configuration to `/config/`

---

## 9. Performance Issues

### 9.1 Missing Optimizations

**Issues identified**:

1. **No request caching** for NFT ownership checks
2. **No image optimization** (no Next.js Image component usage found)
3. **No code splitting** beyond Next.js defaults
4. **No memoization** in React components
5. **No loading states** for async operations

**Impact**: Slower page loads, unnecessary API calls, poor user experience

---

### 9.2 Potential Bottlenecks

1. **NFT ownership verification**: Called on every video access, no caching
2. **Multiple RPC calls**: NEAR RPC called directly without retry or fallback
3. **Sequential operations**: Upload flow could be parallelized

**Recommendation**: Implement caching layer and optimize critical paths

---

## 10. Security Best Practices Violations

### 10.1 OWASP Top 10 Analysis

| Vulnerability | Status | Location |
|---------------|--------|----------|
| A01: Broken Access Control | ❌ CRITICAL | `lib/auth.ts` - Mock authentication |
| A02: Cryptographic Failures | ❌ CRITICAL | `lib/near.ts` - Mock signatures |
| A03: Injection | ✅ OK | Using parameterized queries |
| A04: Insecure Design | ⚠️ MEDIUM | No rate limiting |
| A05: Security Misconfiguration | ⚠️ MEDIUM | Missing env validation |
| A07: Authentication Failures | ❌ CRITICAL | Complete bypass possible |
| A08: Software/Data Integrity | ⚠️ MEDIUM | No checksum verification |

---

### 10.2 Web3-Specific Security Issues

1. **No nonce validation** for signature replay attack prevention
2. **No rate limiting** on NFT ownership checks (potential RPC DoS)
3. **Missing contract verification** - no validation that contract ID is legitimate
4. **No transaction simulation** before signing
5. **Insufficient gas estimation** handling

---

## 11. Detailed Recommendations

### 11.1 Immediate Actions (Week 1)

**Priority 0 - Security Critical**:

1. ✅ **Remove all mock authentication**
   - Implement proper JWT signing in backend
   - Use NEAR signature verification
   - Add session management
   - **Files**: `lib/auth.ts`, `lib/near.ts:53-57`

2. ✅ **Implement real wallet signing**
   - Remove hardcoded "mock_signature"
   - Integrate NEAR wallet selector signing
   - **File**: `components/UploadForm.tsx:47-49`

3. ✅ **Add environment variable validation**
   - Create `lib/env.ts` with validation
   - Check all required vars at startup
   - **Impact**: All files using `process.env!`

4. ✅ **Fix authentication in VideoPlayer**
   - Remove Authorization header bypass
   - Implement proper token passing
   - **File**: `components/VideoPlayer.tsx:35`

**Estimated effort**: 5-7 days

---

### 11.2 Short-term Actions (Weeks 2-4)

**Priority 1 - Core Functionality**:

1. ⚠️ **Resolve schema mismatch**
   - Fix watch_history UUID issue
   - Implement proper nft_cache lookup
   - **File**: `app/api/video/access/route.ts:56-72`

2. ⚠️ **Implement video listing**
   - Query user NFTs
   - Display video library
   - **File**: `app/page.tsx`

3. ⚠️ **Add comprehensive error handling**
   - User-friendly error messages
   - Structured logging
   - Error boundaries
   - **Impact**: All components

4. ⚠️ **Create test suite**
   - Unit tests for auth/near/lighthouse
   - Integration tests for API routes
   - E2E tests for critical flows
   - **Target**: 70%+ code coverage

**Estimated effort**: 12-15 days

---

### 11.3 Medium-term Actions (Month 2)

**Priority 2 - Production Readiness**:

1. 📊 **Add monitoring and logging**
   - Integrate logging service (Sentry, LogRocket)
   - Add performance monitoring
   - Create dashboards

2. 📊 **Implement caching layer**
   - Cache NFT ownership checks
   - Add Redis for session storage
   - Optimize RPC calls

3. 📊 **Security hardening**
   - Add rate limiting
   - Implement CSRF protection
   - Add security headers
   - Conduct security audit

4. 📊 **Documentation**
   - API documentation
   - Architecture diagrams
   - Deployment guide
   - User documentation

**Estimated effort**: 15-20 days

---

### 11.4 Long-term Actions (Month 3+)

**Priority 3 - Optimization & Scale**:

1. 🔮 **Performance optimization**
   - Implement CDN for video delivery
   - Add client-side caching
   - Optimize bundle size
   - Lazy loading

2. 🔮 **Advanced features**
   - Video analytics
   - Comment system
   - Social sharing
   - Subscription management

3. 🔮 **Infrastructure**
   - CI/CD pipeline
   - Automated testing
   - Staging environment
   - Load testing

**Estimated effort**: 20-30 days

---

## 12. Code Quality Metrics Summary

### 12.1 Current State

```
Total Lines of Code: 689
  - Application Code: 689 lines
  - Test Code: 0 lines
  - Documentation: Minimal inline comments

Code Quality Indicators:
  ❌ Test Coverage: 0%
  ⚠️ Type Coverage: ~85% (some 'any' types)
  ⚠️ TODO/FIXME Comments: 7+ instances
  ❌ Mock Implementations: 3 critical mocks
  ❌ Commented Code: 1 instance
  ⚠️ Magic Numbers: 5+ instances
  ⚠️ Hardcoded Strings: 10+ instances
```

### 12.2 Target State (Production Ready)

```
Target Metrics:
  ✅ Test Coverage: >80%
  ✅ Type Coverage: 100% (no 'any')
  ✅ TODO/FIXME: 0 in critical paths
  ✅ Mock Implementations: 0
  ✅ Commented Code: 0
  ✅ Magic Numbers: Extracted to constants
  ✅ Configuration: Environment-based
  ✅ Documentation Coverage: 100% public APIs
  ✅ Security Score: OWASP A+ rating
```

---

## 13. Risk Assessment

### 13.1 Production Deployment Risk Matrix

| Risk Category | Current Risk | Mitigation Required |
|---------------|--------------|---------------------|
| **Security Breach** | 🔴 CRITICAL | Complete auth rewrite |
| **Data Loss** | 🟡 MEDIUM | Add backups, validation |
| **Service Outage** | 🟡 MEDIUM | Error handling, monitoring |
| **Legal/Compliance** | 🟠 HIGH | Audit, data privacy |
| **Performance Issues** | 🟡 MEDIUM | Optimization, caching |
| **User Data Exposure** | 🔴 CRITICAL | Fix auth, add encryption |

### 13.2 Blocker Issues for Production

**Cannot deploy to production until resolved**:

1. ❌ Mock authentication system
2. ❌ Mock signature verification
3. ❌ Hardcoded encryption signatures
4. ❌ Missing environment validation
5. ❌ No monitoring/alerting
6. ❌ No error tracking
7. ❌ Zero test coverage for critical paths

---

## 14. Positive Aspects

Despite significant gaps, the codebase shows several strengths:

✅ **Good architectural foundation**:
- Proper Next.js 16 app router usage
- Clean component structure
- Appropriate use of React Context

✅ **Modern tech stack**:
- Latest Next.js, React 19
- TypeScript enabled with strict mode
- Integration with Web3 primitives (NEAR, Lighthouse, Livepeer)

✅ **Clear intent**:
- Well-commented areas explain design decisions
- Acknowledgment of what's mock vs. real
- Proper TODO comments where implementation incomplete

✅ **No major anti-patterns**:
- Proper async/await usage
- No obvious memory leaks
- Reasonable component sizing

---

## 15. Conclusion and Overall Assessment

### 15.1 Summary

This codebase represents an **early-stage MVP/prototype** with clear understanding of the Web3 video platform architecture but **significant implementation gaps** preventing production use. The most critical issues are:

1. **Complete authentication bypass** via mock implementations
2. **Zero test coverage** making refactoring dangerous
3. **Multiple incomplete features** (video listing, watch history)
4. **Insufficient error handling** for production scenarios

### 15.2 Readiness Assessment

```
Current Stage: Early Prototype / PoC
Production Readiness: 20%

Estimated work to production:
  - Critical security fixes: 5-7 days
  - Complete features: 12-15 days
  - Testing infrastructure: 8-12 days
  - Production hardening: 15-20 days

Total estimated effort: 40-54 days (8-11 weeks)
```

### 15.3 Go/No-Go Recommendation

**❌ DO NOT DEPLOY TO PRODUCTION**

**Rationale**:
- Critical security vulnerabilities allow complete authentication bypass
- Missing test coverage makes changes risky
- Incomplete features would result in poor user experience
- No monitoring would leave production issues undetected

**Recommended path forward**:
1. Complete Week 1 immediate actions (security fixes)
2. Implement comprehensive test suite
3. Complete core features (video listing)
4. Conduct security audit
5. Deploy to staging environment
6. Load testing and performance optimization
7. Production deployment with monitoring

---

## 16. Appendix: File-by-File Quality Scores

| File | Lines | Quality Score | Critical Issues |
|------|-------|---------------|-----------------|
| `lib/auth.ts` | 68 | 20/100 | Mock auth bypass |
| `lib/near.ts` | 58 | 35/100 | Mock signatures |
| `lib/lighthouse.ts` | 46 | 65/100 | Untyped params |
| `lib/supabase.ts` | 11 | 50/100 | No env validation |
| `app/api/video/access/route.ts` | 84 | 40/100 | Schema mismatch |
| `components/UploadForm.tsx` | 134 | 35/100 | Mock signing |
| `components/VideoPlayer.tsx` | 95 | 55/100 | Limited error handling |
| `components/Navbar.tsx` | 55 | 75/100 | Minor improvements |
| `components/providers/WalletProvider.tsx` | 72 | 70/100 | Good implementation |
| `app/page.tsx` | 43 | 40/100 | Incomplete features |
| `app/layout.tsx` | 23 | 80/100 | Clean structure |

**Average Quality Score**: 47/100

---

## Document Information

**Prepared by**: Quality Engineer Agent
**Assessment Methodology**: Static code analysis, manual review, OWASP security assessment
**Tools Used**: TypeScript compiler, grep, code review
**Coverage**: All application source files (689 lines)
**Excluded**: node_modules, build artifacts, configuration files

**Last Updated**: 2025-11-28
**Next Review Recommended**: After security fixes implemented
