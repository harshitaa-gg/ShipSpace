import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  LogIn,
  ArrowRight,
  ShieldCheck,
  Mail,
  Lock,
  ArrowLeft,
  Building2,
  Briefcase,
  Info,
  Eye,
  EyeOff,
  CheckCircle2,
  Loader2,
  Anchor,
  Scale,
  Compass,
} from 'lucide-react';
import { ShipSpaceLogoIcon } from '../components/NavbarAndSidebar';
import { useIdentity } from '../context/IdentityContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlRole = searchParams.get('role');
  const initialRole = ['provider', 'admin'].includes(urlRole) ? urlRole : 'trader';

  const {
    users,
    setSelectedTraderId,
    setSelectedProviderId,
    setSelectedAdminId,
    setActiveRole,
  } = useIdentity();
  const [role, setRole] = useState(initialRole); // 'trader' | 'provider' | 'admin'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  const validate = (fieldValues = { email, password }) => {
    const errs = {};
    if ('email' in fieldValues) {
      if (!fieldValues.email.trim()) {
        errs.email = 'Work email address is required.';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fieldValues.email.trim())) {
        errs.email = 'Please enter a valid commercial email address.';
      }
    }
    if ('password' in fieldValues) {
      if (!fieldValues.password) {
        errs.password = 'Password is required.';
      } else if (fieldValues.password.length < 6) {
        errs.password = 'Password must be at least 6 characters.';
      }
    }
    return errs;
  };

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const errs = validate({ [field]: field === 'email' ? email : password });
    setErrors((prev) => ({ ...prev, [field]: errs[field] }));
  };

  const handleRoleChange = (newRole) => {
    setRole(newRole);
    if (newRole === 'provider') {
      setEmail('ops.india@maersk-lcl.com');
    } else if (newRole === 'admin') {
      setEmail('admin@shipspace.internal');
    } else {
      setEmail('aarav.exports@textiles.in');
    }
    setPassword('demopass123');
    setErrors({});
  };

  const fillQuickDemo = (demoRole) => {
    setRole(demoRole);
    if (demoRole === 'provider') {
      setEmail('ops.india@maersk-lcl.com');
      setPassword('providerpass123');
    } else if (demoRole === 'admin') {
      setEmail('admin@shipspace.internal');
      setPassword('adminpass123');
    } else {
      setEmail('aarav.exports@textiles.in');
      setPassword('traderpass123');
    }
    setErrors({});
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationErrors = validate({ email, password });
    setTouched({ email: true, password: true });

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);

      // Check if entered email matches any existing database user account
      const matched = users.find(
        (u) => (u.email || '').toLowerCase() === email.trim().toLowerCase()
      );

      const effectiveRole = matched?.role || role;
      const targetUserId = matched ? Number(matched.user_id || matched.id) : null;

      if (effectiveRole === 'admin') {
        setSelectedAdminId(targetUserId || 27);
        setActiveRole('admin');
        navigate('/admin');
      } else if (effectiveRole === 'provider') {
        setSelectedProviderId(targetUserId || 1);
        setActiveRole('provider');
        navigate('/provider');
      } else {
        setSelectedTraderId(targetUserId || 7);
        setActiveRole('trader');
        navigate('/bookings');
      }
    }, 450);
  };

  return (
    <div className="auth-split-layout">
      {/* ===================================================================
          LEFT BRAND PANE: Enterprise Freight Narrative & Guarantees
          =================================================================== */}
      <div className="auth-brand-pane">
        <div className="auth-brand-inner">
          <Link to="/" className="auth-pane-logo-link">
            <ShipSpaceLogoIcon size={34} />
            <div className="auth-pane-logo-text">
              <span className="auth-pane-brand-title">ShipSpace</span>
              <span className="auth-pane-brand-sub">LCL FREIGHT MARKETPLACE</span>
            </div>
          </Link>

          <div className="auth-pane-content">
            <div className="auth-pane-badge">
              {role === 'admin'
                ? 'PLATFORM ADMINISTRATOR & GOVERNANCE'
                : role === 'provider'
                ? 'LOGISTICS PROVIDER PORTAL'
                : 'CARGO SHIPPER & TRADER ACCESS'}
            </div>

            <h2 className="auth-pane-heading">
              {role === 'admin'
                ? 'Oversee Global Fleet Capacity, Operations & Platform Logs'
                : role === 'provider'
                ? 'Monetize Scheduled Container Capacity In Real-Time'
                : 'Discover & Book Verified LCL Container Space'}
            </h2>

            <p className="auth-pane-desc">
              {role === 'admin'
                ? 'Access real-time platform metrics, monitor booking audit history, track corridor capacity utilization, and manage user accounts and reference master data.'
                : role === 'provider'
                ? 'Join ocean freight consolidators and asset operators managing voyage schedules, tracking CBM/tonne utilization, and accepting verified digital cargo reservations.'
                : 'Join international exporters and shippers reserving fractional container capacity on high-volume ocean lanes with automated W/M tariffs and guaranteed allocations.'}
            </p>

            {/* Feature Highlights Based on Active Role */}
            <div className="auth-pane-feature-list">
              {role === 'admin' ? (
                <>
                  <div className="auth-pane-feature-item">
                    <div className="pane-feature-icon">
                      <ShieldCheck size={18} />
                    </div>
                    <div>
                      <strong>System Audit Logging</strong>
                      <span>Real-time status transitions and operational traceability</span>
                    </div>
                  </div>
                  <div className="auth-pane-feature-item">
                    <div className="pane-feature-icon">
                      <Scale size={18} />
                    </div>
                    <div>
                      <strong>Corridor &amp; Fleet Analytics</strong>
                      <span>Real-time platform summaries and route utilization reports</span>
                    </div>
                  </div>
                  <div className="auth-pane-feature-item">
                    <div className="pane-feature-icon">
                      <Building2 size={18} />
                    </div>
                    <div>
                      <strong>Master Reference Governance</strong>
                      <span>Manage UN/LOCODE seaports, shipping routes, and user accounts</span>
                    </div>
                  </div>
                </>
              ) : role === 'trader' ? (
                <>
                  <div className="auth-pane-feature-item">
                    <div className="pane-feature-icon">
                      <Scale size={18} />
                    </div>
                    <div>
                      <strong>Transparent W/M Pricing</strong>
                      <span>Dynamic calculation based on 1 CBM = 1,000 kg standard</span>
                    </div>
                  </div>
                  <div className="auth-pane-feature-item">
                    <div className="pane-feature-icon">
                      <Lock size={18} />
                    </div>
                    <div>
                      <strong>Zero Overselling Guarantee</strong>
                      <span>Row-locked database transactions eliminate phantom bookings</span>
                    </div>
                  </div>
                  <div className="auth-pane-feature-item">
                    <div className="pane-feature-icon">
                      <Compass size={18} />
                    </div>
                    <div>
                      <strong>UN/LOCODE Standardized Lanes</strong>
                      <span>Direct port-to-port schedules across strategic ocean hubs</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="auth-pane-feature-item">
                    <div className="pane-feature-icon">
                      <Anchor size={18} />
                    </div>
                    <div>
                      <strong>Load Factor Optimization</strong>
                      <span>Convert empty container volume into high-margin LCL bookings</span>
                    </div>
                  </div>
                  <div className="auth-pane-feature-item">
                    <div className="pane-feature-icon">
                      <ShieldCheck size={18} />
                    </div>
                    <div>
                      <strong>Strict Cutoff Enforcement</strong>
                      <span>Automated closing rules protect terminal gate-in deadlines</span>
                    </div>
                  </div>
                  <div className="auth-pane-feature-item">
                    <div className="pane-feature-icon">
                      <Building2 size={18} />
                    </div>
                    <div>
                      <strong>Fleet Utilization Dashboard</strong>
                      <span>Live CBM, weight, and revenue analytics via database views</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="auth-pane-footer">
            <div className="auth-pane-security-tag">
              <ShieldCheck size={14} />
              <span>PostgreSQL ACID Architecture · ISO 6346 Standards</span>
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================
          RIGHT FORM PANE: Role Selector, Inputs & Controls
          =================================================================== */}
      <div className="auth-form-pane">
        <div className="auth-form-container">
          {/* Top Return Link */}
          <div className="auth-top-nav">
            <Link to="/" className="auth-back-link">
              <ArrowLeft size={16} />
              <span>Back to Public Marketplace</span>
            </Link>
          </div>

          <div className="auth-header-block">
            <h1 className="auth-page-title">Sign in to ShipSpace</h1>
            <p className="auth-page-subtitle">
              Enter your commercial credentials to access your freight workspace.
            </p>
          </div>

          {/* Role Selector Tabs */}
          <div className="auth-role-tabs-wrap">
            <label className="auth-field-label">Select Account Role</label>
            <div className="auth-role-tabs-grid tabs-3col" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={role === 'trader'}
                className={`auth-role-tab-card ${role === 'trader' ? 'active' : ''}`}
                onClick={() => handleRoleChange('trader')}
              >
                <div className="role-tab-icon">
                  <Briefcase size={18} />
                </div>
                <div className="role-tab-text">
                  <strong className="role-tab-title">Cargo Trader</strong>
                  <span className="role-tab-desc">Book fractional container space</span>
                </div>
                {role === 'trader' && (
                  <CheckCircle2 size={16} className="role-tab-check" aria-hidden="true" />
                )}
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={role === 'provider'}
                className={`auth-role-tab-card ${role === 'provider' ? 'active' : ''}`}
                onClick={() => handleRoleChange('provider')}
              >
                <div className="role-tab-icon">
                  <Building2 size={18} />
                </div>
                <div className="role-tab-text">
                  <strong className="role-tab-title">Logistics Provider</strong>
                  <span className="role-tab-desc">Publish capacity &amp; manage listings</span>
                </div>
                {role === 'provider' && (
                  <CheckCircle2 size={16} className="role-tab-check" aria-hidden="true" />
                )}
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={role === 'admin'}
                className={`auth-role-tab-card ${role === 'admin' ? 'active' : ''}`}
                onClick={() => handleRoleChange('admin')}
              >
                <div className="role-tab-icon">
                  <ShieldCheck size={18} />
                </div>
                <div className="role-tab-text">
                  <strong className="role-tab-title">Platform Admin</strong>
                  <span className="role-tab-desc">Governance &amp; trigger audit logs</span>
                </div>
                {role === 'admin' && (
                  <CheckCircle2 size={16} className="role-tab-check" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {/* Login Form */}
          <form className="auth-form-card" onSubmit={handleSubmit} noValidate>
            {/* Work Email Field */}
            <div className={`auth-field-group ${errors.email && touched.email ? 'has-error' : ''}`}>
              <label className="auth-field-label" htmlFor="login-email">
                Commercial Work Email
              </label>
              <div className="auth-input-wrapper">
                <Mail size={16} className="auth-input-icon" />
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder={
                    role === 'provider'
                      ? 'ops.india@maersk-lcl.com'
                      : role === 'admin'
                      ? 'admin@shipspace.internal'
                      : 'aarav.exports@textiles.in'
                  }
                  className="auth-input"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (touched.email) {
                      setErrors((prev) => ({
                        ...prev,
                        email: validate({ email: e.target.value }).email,
                      }));
                    }
                  }}
                  onBlur={() => handleBlur('email')}
                />
              </div>
              {errors.email && touched.email && (
                <span className="auth-inline-error" role="alert">
                  {errors.email}
                </span>
              )}
            </div>

            {/* Password Field */}
            <div className={`auth-field-group ${errors.password && touched.password ? 'has-error' : ''}`}>
              <div className="auth-label-row">
                <label className="auth-field-label" htmlFor="login-password">
                  Account Password
                </label>
                <Link to="/forgot-password" className="auth-text-link">
                  Forgot password?
                </Link>
              </div>
              <div className="auth-input-wrapper">
                <Lock size={16} className="auth-input-icon" />
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••••••"
                  className="auth-input"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (touched.password) {
                      setErrors((prev) => ({
                        ...prev,
                        password: validate({ password: e.target.value }).password,
                      }));
                    }
                  }}
                  onBlur={() => handleBlur('password')}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword((prev) => !prev)}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && touched.password && (
                <span className="auth-inline-error" role="alert">
                  {errors.password}
                </span>
              )}
            </div>

            {/* Remember Device Checkbox */}
            <div className="auth-checkbox-row">
              <label className="custom-checkbox-label">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="custom-checkbox-input"
                />
                <span className="checkbox-text">Remember this workstation for 30 days</span>
              </label>
            </div>

            {/* Submit Action */}
            <button
              type="submit"
              className="auth-submit-btn"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <LogIn size={16} />
                  <span>
                    Sign In as{' '}
                    {role === 'admin'
                      ? 'Platform Administrator'
                      : role === 'provider'
                      ? 'Logistics Provider'
                      : 'Cargo Trader'}
                  </span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Registration Redirect Footer */}
          <div className="auth-footer-nav">
            <span>New to ShipSpace?</span>
            <Link to={`/register?role=${role === 'admin' ? 'trader' : role}`} className="auth-accent-link">
              Create a {role === 'provider' ? 'Provider' : 'Trader'} account →
            </Link>
          </div>

          {/* Discreet Evaluation Shortcuts */}
          <div className="auth-demo-bar">
            <span className="auth-demo-caption">Demo Credentials:</span>
            <button
              type="button"
              className="auth-demo-chip"
              onClick={() => fillQuickDemo('trader')}
            >
              Trader #7
            </button>
            <button
              type="button"
              className="auth-demo-chip"
              onClick={() => fillQuickDemo('provider')}
            >
              Provider #1
            </button>
            <button
              type="button"
              className="auth-demo-chip"
              onClick={() => fillQuickDemo('admin')}
            >
              Admin #27
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
