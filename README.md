# PatientTrac OutPatient Surgery - Complete Application

**Standalone surgical documentation platform accessible from all specialty EMRs**

## 📦 What's Included

### 1. **landing.html** - Marketing Homepage
- Hero section with value proposition
- Features grid (6 surgical documentation modules)
- Integration section (PatientTracForge, Revela, Mind)
- Pricing cards ($299 Starter, $699 Professional, $1,499 Enterprise)
- Footer with navigation and legal links

### 2. **app.html** - Authentication Portal
- Email + Password sign-in
- Google Authenticator TOTP (MFA) setup
- MFA verification for returning users
- Cross-app token validation from URL parameters
- Secure Supabase authentication

### 3. **dashboard.html** - Main Surgical Navigation
- Patient context banner (photo, name, DOB, MRN)
- 6 navigation cards:
  - Pre-Op Assessment
  - Operative Note
  - Anesthesia Record
  - Post-Op Care
  - Equipment & Supplies
  - Billing Preview
- Empty state when no patient context
- Sign out functionality

## 🚀 Deployment Instructions

### Step 1: Create GitHub Repo
```bash
mkdir patienttrac-surgery
cd patienttrac-surgery

# Copy files
cp ~/Downloads/surgery-app/* .

# Initialize Git
git init
git add .
git commit -m "Initial PatientTrac OutPatient Surgery application"
git remote add origin https://github.com/PatientTrac/patienttrac-surgery.git
git push -u origin master
```

### Step 2: Deploy to Netlify
1. Go to https://app.netlify.com
2. Click "Add new site" → "Import an existing project"
3. Connect GitHub → Select `PatientTrac/patienttrac-surgery`
4. Build settings:
   - Build command: (leave empty)
   - Publish directory: `.`
5. Deploy!

### Step 3: Configure Custom Domain
1. In Netlify: Site settings → Domain management
2. Add custom domain: `patienttrac-surgery.com`
3. Configure DNS (A/CNAME records)
4. Enable HTTPS (automatic)

### Step 4: Update Database Routing
Already done! Migration 036 added:
- `saas.app_routing` entry for surgery app
- `cr.surgery_encounter_view` for cross-app data access

## 🔗 Cross-App Integration

### From PatientTracForge:
```typescript
const { data } = await supabase.rpc('checkin_and_route', {
  p_appointment_id: appointmentId,
  p_target_app: 'surgery'
});
window.location.href = data.url;
// Opens: patienttrac-surgery.com/dashboard?encounter_id=X&patient_id=Y&token=Z
```

### From Revela:
```typescript
// In RevelaDashboard.tsx - replace BasicOperativeNote module
<button onClick={() => routeToSurgery()}>
  ⚕️ Operative Note → Surgery App
</button>

async function routeToSurgery() {
  const { data } = await supabase.rpc('checkin_and_route', {
    p_appointment_id: appointmentId,
    p_target_app: 'surgery'
  });
  window.location.href = data.url;
}
```

## 🎨 Design System

- Background: `#060e1c` (navy)
- Accent: `#c9a96e` (gold)
- Border: `rgba(201, 169, 110, 0.2)`
- Fonts: Inter (body), system fonts fallback

## 🔐 Security Features

1. **Supabase Authentication**
   - Email + password required
   - Session management
   - Secure token storage

2. **Google Authenticator MFA**
   - TOTP enrollment on first sign-in
   - QR code generation
   - 6-digit verification code
   - Required for all users

3. **Cross-App Token Bridge**
   - 4-hour session tokens
   - `validate_cross_app_token()` RPC
   - Automatic expiration
   - URL parameter validation

## 📊 Database Views

### `cr.surgery_encounter_view`
Provides patient context for cross-app access:
- Patient demographics (name, DOB, sex, photo)
- Encounter details (type, date, status)
- Provider information
- Insurance details
- Facility information

## 🎯 Next Steps

1. ✅ Deploy landing page to patienttrac-surgery.com
2. ✅ Test authentication flow
3. ⏳ Build operative note page (operative.html)
4. ⏳ Build pre-op assessment page (preop.html)
5. ⏳ Build post-op care page (postop.html)
6. ⏳ Build equipment management page (equipment.html)
7. ⏳ Update Revela to route to surgery app
8. ⏳ Test cross-app flow end-to-end

## 📞 Support

- **Sales:** sales@patienttrac.com
- **Support:** support@patienttrac.com
- **Legal:** legal@patienttrac.com

---

**PatientTrac Corp © 2026 | HIPAA Compliant**
