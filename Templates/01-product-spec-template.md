# Product Specification Template

> **Purpose**: This template ensures all critical decisions are made BEFORE coding begins. Sections are ordered by dependency—each section builds on the previous ones.

---

## How to Use This Template

### Section Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Product Overview                                             │
│     What problem? Who has it? How do we measure success?         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. Tech Stack                                                   │
│     What tools will we use? What are their constraints?          │
│     (Informs all technical decisions below)                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. User Roles (High Level)                                      │
│     Who are the actors? What do they generally do?               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  4. Features & User Flows                                        │
│     What can users do? What are the step-by-step flows?          │
│     (Reveals the operations that need permissions)               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  5. Page Structure & URLs                                        │
│     What screens exist? What's the URL structure?                │
│     (Reveals where each operation happens)                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  6. Permissions & Security                                       │
│     Now we know: Roles × Features × Pages                        │
│     → Permission matrix, RLS policies, security boundaries       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  7. Data Model                                                   │
│     What data do features & pages need?                          │
│     → Entities, relationships, data dictionary, JSON shapes      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  8. API Design                                                   │
│     How do pages get data? What endpoints exist?                 │
│     → Routes, request/response schemas, validation               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  9. Engineering Standards                                        │
│     How do we build it? What quality gates exist?                │
│     → TypeScript config, linting, CI/CD, type generation         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  10. Testing & Deployment                                        │
│      How do we verify it works? How do we ship it?               │
└─────────────────────────────────────────────────────────────────┘
```

### Sign-off Checkpoints

| After Section | Get Sign-off From |
|---------------|-------------------|
| 1-4 (Overview → Features) | Product owner / stakeholders |
| 5-6 (Pages → Security) | Product + Engineering leads |
| 7-9 (Data → Standards) | Engineering lead |
| 10 (Testing/Deploy) | Engineering + Ops |

---

## 1. Product Overview

### 1.1 Problem Statement

*What problem does this product solve? Who experiences this problem?*

```
[2-3 sentences describing the problem and who has it]
```

### 1.2 Solution Summary

*How does this product solve the problem?*

```
[2-3 sentences describing the solution approach]
```

### 1.3 Success Metrics

*How will we measure success?*

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| | | |

### 1.4 Scope

**In Scope (MVP):**
-
-

**Out of Scope (Future):**
-
-

---

## 2. Tech Stack

*Choose tools AFTER understanding the problem, BEFORE designing features.*

| Layer | Technology | Version | Rationale |
|-------|------------|---------|-----------|
| Frontend | | | |
| Backend | | | |
| Database | | | |
| Auth | | | |
| Storage | | | |
| Hosting | | | |

### 2.1 Technical Constraints

*Document known limitations BEFORE they become problems during implementation.*

| Constraint | Impact | Mitigation |
|------------|--------|------------|
| | | |

### 2.2 Key Technical Decisions

| Decision | Choice | Alternatives Considered | Why This Choice |
|----------|--------|------------------------|-----------------|
| | | | |

---

## 3. User Roles

*High-level definition of WHO the users are. Detailed permissions come later in Section 6.*

### 3.1 Role Definitions

| Role | Description | Scope |
|------|-------------|-------|
| | | |

### 3.2 Role Hierarchy (if applicable)

```
[Diagram showing role relationships]

Example:
Platform Admin
└── School Admin
    └── Course Staff (Instructor, Assistant, Coordinator)
        └── Student
```

### 3.3 Role Assignment

*How does a user get each role?*

| Role | Assigned By | Assignment Method |
|------|-------------|-------------------|
| | | |

---

## 4. Features & User Flows

*What can users do? This section reveals the OPERATIONS that will need permissions.*

### 4.1 Feature List (MVP)

| Feature | Description | Primary Role(s) |
|---------|-------------|-----------------|
| | | |

### 4.2 User Flows

*Document the step-by-step journeys. Each step may imply a page and permissions.*

#### Flow: [Flow Name]

**Actor:** [Role]
**Goal:** [What they want to accomplish]

```
1. User does X
2. System shows Y
3. User does Z
...
```

**Implied pages:** [List pages this flow needs]
**Implied operations:** [List operations: create, read, update, delete what]

*Repeat for each major flow...*

### 4.3 Product Backlog

| Priority | Feature | Description | Dependencies |
|----------|---------|-------------|--------------|
| P1 | | | |
| P2 | | | |
| P3 | | | |

---

## 5. Page Structure & URLs

*WHERE do users perform each operation? Derived from user flows.*

### 5.1 URL Schema

*Define URL patterns. These reveal your resource hierarchy.*

| Pattern | Page | Access Level |
|---------|------|--------------|
| `/` | Home | Public |
| `/login` | Login | Public |
| `/dashboard` | Dashboard | Authenticated |
| `/[resource]/:id` | Resource Detail | Varies |
| `/admin` | Admin Panel | Admin only |

### 5.2 Page Inventory

*List all pages with their purpose and data needs.*

| Page | URL | Purpose | Data Needed | Primary Actions |
|------|-----|---------|-------------|-----------------|
| | | | | |

### 5.3 Navigation Structure

```
[Diagram or description of navigation]

Example:
Header (all pages)
├── Logo → /
├── Nav Links (role-based)
└── User Menu
    ├── Profile
    ├── Settings (if admin)
    └── Logout
```

### 5.4 Reserved Slugs

*Slugs that cannot be used for user-generated content (to avoid URL conflicts).*

| Slug | Reason |
|------|--------|
| admin | Conflicts with admin routes |
| api | Reserved for API |
| | |

---

## 6. Permissions & Security

*NOW you can define detailed permissions because you know: Roles × Features × Pages*

### 6.1 Permission Types

*Define granular permissions based on operations from Section 4.*

| Permission Key | Description | Operations Enabled |
|----------------|-------------|-------------------|
| `resource_create` | Create new resources | POST /api/resources |
| `resource_read` | View resources | GET /api/resources |
| `resource_update` | Modify resources | PATCH /api/resources/:id |
| `resource_delete` | Remove resources | DELETE /api/resources/:id |

### 6.2 Permission Matrix

*Map roles (Section 3) to permissions. Use ✓, ✗, or "own" for self-only.*

| Role | resource_create | resource_read | resource_update | resource_delete |
|------|:---------------:|:-------------:|:---------------:|:---------------:|
| Admin | ✓ | ✓ | ✓ | ✓ |
| User | ✓ | own | own | ✗ |

### 6.3 Page Access Control

*Map URLs (Section 5) to required permissions.*

| URL Pattern | Required Permission | Notes |
|-------------|---------------------|-------|
| `/admin/*` | `admin_access` | All admin pages |
| `/resource/:id/edit` | `resource_update` | Must own or be admin |

### 6.4 Authorization Strategy

| Layer | Implementation | Purpose |
|-------|----------------|---------|
| **UI** | Hide unauthorized elements | Good UX (not security) |
| **API** | Check permissions, return 403 | Meaningful errors |
| **Database** | RLS policies | Final defense |

### 6.5 RLS Policies

*Define Row Level Security for each table. This is your security foundation.*

#### Table: `[table_name]`

| Operation | Policy Name | Condition |
|-----------|-------------|-----------|
| SELECT | | |
| INSERT | | |
| UPDATE | | |
| DELETE | | |

*Repeat for each table...*

### 6.6 Security Boundaries (Negative Test Cases)

*Document what MUST be blocked. These become security tests.*

| Scenario | Expected Result | Priority |
|----------|-----------------|----------|
| User A accesses User B's private data | BLOCKED | Critical |
| Non-admin accesses admin page | BLOCKED | Critical |
| | | |

---

## 7. Data Model

*What data does the application need? Derived from features and pages.*

### 7.1 Entity Relationship Diagram

```
[ASCII diagram or link to diagram tool]

Example:
Users
├── Posts (one-to-many)
│   └── Comments (one-to-many)
└── Profiles (one-to-one)
```

### 7.2 Data Dictionary

*Complete this for EVERY table BEFORE writing migrations.*

#### Table: `[table_name]`

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | UUID | No | gen_random_uuid() | PK | |
| | | | | | |

**Indexes:**
**Unique constraints:**

*Repeat for each table...*

### 7.3 JSON Column Shapes

*Define TypeScript interfaces for ALL JSONB columns.*

```typescript
// [Description of where this is used]
interface ShapeName {
  field: type;
}
```

### 7.4 Enums and Status Values

| Field | Valid Values | Transitions |
|-------|--------------|-------------|
| | | |

---

## 8. API Design

*How do pages get and modify data?*

### 8.1 Endpoint Inventory

| Method | Path | Description | Permission Required |
|--------|------|-------------|---------------------|
| GET | /api/resources | List resources | resource_read |
| POST | /api/resources | Create resource | resource_create |
| | | | |

### 8.2 Request/Response Schemas

*Use Zod schemas for validation.*

```typescript
// POST /api/resources
const CreateResourceSchema = z.object({
  name: z.string().min(1).max(100),
});

// Response
interface ResourceResponse {
  id: string;
  name: string;
  created_at: string;
}
```

### 8.3 Error Response Format

```typescript
interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}
```

---

## 9. Engineering Standards

### 9.1 TypeScript Configuration

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

**Required:** `strict: true` is non-negotiable.

### 9.2 Linting Rules

```json
{
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-non-null-assertion": "warn"
  }
}
```

**Required:** `no-explicit-any` must be `error`, not `warn`.

### 9.3 Type Generation

```bash
# Run after EVERY migration
npm run db:types
```

### 9.4 CI/CD Pipeline

```yaml
# Minimum requirements
- lint
- typecheck (via build)
- test
```

**Gate:** PRs cannot merge without passing all checks.

### 9.5 Code Review Requirements

| Requirement | Enforced By |
|-------------|-------------|
| All PRs require 1+ approval | GitHub branch protection |
| CI must pass | GitHub branch protection |
| | |

---

## 10. Testing & Deployment

### 10.1 Test Strategy

| Type | Coverage Target | Tools |
|------|-----------------|-------|
| Unit | Business logic | |
| Integration | API routes | |
| E2E | Critical flows | |
| Security | RLS policies | |

### 10.2 Critical Test Cases

*From Section 6.6 Security Boundaries*

| Test | Type | Priority |
|------|------|----------|
| | | |

### 10.3 Environments

| Environment | Purpose | URL |
|-------------|---------|-----|
| Development | Local dev | localhost |
| Staging | Pre-prod testing | |
| Production | Live | |

### 10.4 Environment Variables

| Variable | Required | Secret | Description |
|----------|----------|--------|-------------|
| | | | |

### 10.5 Deployment Process

```
1. PR merged to main
2. CI runs (lint, build, test)
3. Auto-deploy to staging
4. Manual promotion to production
```

---

## 11. Open Questions

*Track unresolved decisions. Resolve BEFORE implementing affected features.*

| Question | Options | Decision | Date |
|----------|---------|----------|------|
| | | Pending | |

---

## 12. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | | Initial draft |

---

## Appendix: Pre-Coding Checklist

### Product (Sections 1-4)
- [ ] Problem statement clear
- [ ] Success metrics defined
- [ ] User roles identified
- [ ] MVP features listed
- [ ] User flows documented

### Design (Sections 5-6)
- [ ] All pages identified with URLs
- [ ] Permission types defined
- [ ] Permission matrix complete
- [ ] RLS policies for ALL tables
- [ ] Security boundaries documented

### Technical (Sections 7-9)
- [ ] Data dictionary complete
- [ ] JSON shapes defined
- [ ] API endpoints listed
- [ ] Engineering standards configured
- [ ] CI/CD pipeline ready

### Sign-offs
- [ ] Product owner approved (Sections 1-4)
- [ ] Engineering lead approved (Sections 5-9)
- [ ] Security review completed (Section 6)
