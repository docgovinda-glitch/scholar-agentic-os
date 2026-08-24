# Google Authentication and Onboarding Flow

This document details the architecture and implementation of the Google Sign-In and Onboarding feature introduced in Scholar Core to manage third-party authentication while ensuring data integrity.

## The Problem
Standard Email/Password sign-ups pass through a multi-step registration form that collects mandatory data (Role, Education Level, etc.) before inserting the user into the `profiles` table.
When users authenticate via an OAuth provider like Google, this form is bypassed, resulting in empty or incomplete profiles, which breaks downstream application logic.

## The Solution: Onboarding Route Guard

Instead of preventing Google Sign-In, we implemented a routing middleware that intercepts users with incomplete profiles.

### 1. `RequireOnboarding` Guard (`src/desk/DeskAuthGate.tsx`)
This component wraps all authenticated workspace routes. 
- It reads the user's profile from the session.
- It checks if required fields (`userType` and `educationLevel`) are present.
- **If complete:** It renders the `<Outlet />` allowing the user into the app.
- **If incomplete:** It intercepts the navigation and forces a `<Navigate to="/onboarding" replace />`.

### 2. The `/onboarding` Route (`src/desk/auth/AuthFlow.tsx`)
This route renders the `OnboardingScreen`, a dedicated form specifically for collecting missing profile data.
- It asks for Role, Education Level, Affiliation, and Mobile Number.
- Upon submission, it leverages the existing `saveProfileFields` function in `supabaseAuthService.ts` to merge the data into the user's `profiles` record.
- Once saved, the user is navigated back to the workspace root (`/projects`), where the `RequireOnboarding` guard evaluates them again and lets them through.

### 3. Application Routing (`src/desk/DeskApp.tsx`)
```tsx
<Route path="/*" element={<RequireAuth />}>
  {/* The onboarding screen requires authentication, but NOT a complete profile */}
  <Route path="onboarding" element={<OnboardingRoute />} />
  
  {/* The workspace requires both authentication AND a complete profile */}
  <Route element={<RequireOnboarding />}>
    <Route element={<OnboardingGate />}>
      <Route path="projects" element={<ProjectsIndexRoute />} />
      {/* ... other workspace routes */}
    </Route>
  </Route>
</Route>
```

## Identity Linking
Supabase is configured with **Manual Linking** (`security_manual_linking_enabled: true`) and **Automatic Identity Linking**.
This means if an existing user who previously registered with `user@example.com` via password clicks "Continue with Google", Supabase will securely link the Google identity to their existing account rather than throwing an error or creating a duplicate profile. 
Because their profile is already complete, they will bypass the `/onboarding` route entirely.
