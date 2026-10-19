import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  UserPlus,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Mail,
  Lock,
  Building2,
  Briefcase,
  User,
  Phone,
  Info,
  CheckCircle2,
  Eye,
  EyeOff,
  Compass,
  Layers,
  Scale,
  Anchor,
  Loader2,
} from 'lucide-react';
import { ShipSpaceLogoIcon } from '../components/NavbarAndSidebar';
import { useIdentity } from '../context/IdentityContext';
import { api } from '../api/client';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialRole = searchParams.get('role') === 'provider' ? 'provider' : 'trader';

  const {
    setSelectedTraderId,
    setSelectedProviderId,
    setActiveRole,
    refreshCatalog,
  } = useIdentity();

  // Multi-step state: 1 = Organization & Contact, 2 = Freight Profile & Security, 3 = Confirmation
  const [currentStep, setCurrentStep] = useState(1);
  const [createdAccount, setCreatedAccount] = useState(null);
  const [serverError, setServerError] = useState(null);
  const [role, setRole] = useState(initialRole); // 'trader' | 'provider'

  // Form Fields State (Preserved across role and step changes)
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Role-Specific Fields
  const [traderCorridor, setTraderCorridor] = useState('INBOM-AEDXB');
  const [traderMonthlyVolume, setTraderMonthlyVolume] = useState('5-15');
  const [providerOperatingType, setProviderOperatingType] = useState('nvocc');
  const [providerBasePort, setProviderBasePort] = useState('INNSA');

  // Security & Legal Fields
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Validation & UI State
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  // Step 1 Validation
  const validateStep1 = () => {
    const errs = {};
    if (!fullName.trim()) errs.fullName = 'Full name is required.';
    if (!companyName.trim()) errs.companyName = 'Company / entity name is required.';
    if (!email.trim()) {
      errs.email = 'Commercial work email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errs.email = 'Please enter a valid commercial email address.';
    }
    if (!phone.trim()) {
      errs.phone = 'Commercial contact phone is required.';
    } else if (phone.replace(/\D/g, '').length < 7) {
      errs.phone = 'Please enter a valid phone number (min 7 digits).';
    }
    return errs;
  };

  // Step 2 Validation
  const validateStep2 = () => {
    const errs = {};
    if (!password) {
      errs.password = 'Password is required.';
    } else if (password.length < 8) {
      errs.password = 'Password must be at least 8 characters.';
    }

    if (!confirmPassword) {
      errs.confirmPassword = 'Please confirm your password.';
    } else if (password !== confirmPassword) {
      errs.confirmPassword = 'Passwords do not match.';
    }

    if (!agreedToTerms) {
      errs.agreedToTerms = 'You must agree to the Terms of Service & Privacy Policy.';
    }
    return errs;
  };

  const handleStep1Submit = (e) => {
    e.preventDefault();
    const errs = validateStep1();
    setTouched({ fullName: true, companyName: true, email: true, phone: true });
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setCurrentStep(2);
  };

  const handleStep2Submit = async (e) => {
    e.preventDefault();
    const errs = validateStep2();
    setTouched((prev) => ({
      ...prev,
      password: true,
      confirmPassword: true,
      agreedToTerms: true,
    }));
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setIsSubmitting(true);
    setServerError(null);
    try {
      const res = await api.register({
        name: fullName.trim(),
        email: email.trim(),
        password,
        role,
        company_name: companyName.trim(),
        contact_phone: phone.trim(),
      });

      const registered = res.data;
      setCreatedAccount(registered);

      if (role === 'provider') {
        setSelectedProviderId(Number(registered.id || registered.user_id));
        setActiveRole('provider');
      } else {
        setSelectedTraderId(Number(registered.id || registered.user_id));
        setActiveRole('trader');
      }

      await refreshCatalog();
      setIsCompleted(true);
    } catch (err) {
      setServerError(
        err.message || 'Registration failed. Please check your information and try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteAndEnter = () => {
    if (role === 'provider') {
      navigate('/provider');
    } else {
      navigate('/search');
    }
  };

  return (
    <div className="auth-split-layout">
      {/* ===================================================================
          LEFT BRAND PANE: Role-Specific Onboarding Guidance
          =================================================================== */}
      <div className="auth-brand-pane">
        <div className="auth-brand-inner">
          <Link to="/" className="auth-pane-logo-link">
            <ShipSpaceLogoIcon size={34} />
            <div className="auth-pane-logo-text">
              <span className="auth-pane-brand-title">ShipSpace</span>
              <span className="auth-pane-brand-sub">ENTERPRISE ONBOARDING</span>
            </div>
          </Link>

          <div className="auth-pane-content">
            <div className="auth-pane-badge">
              {role === 'trader' ? 'CARGO SHIPPER ONBOARDING' : 'LOGISTICS PROVIDER ENROLLMENT'}
            </div>

            <h2 className="auth-pane-heading">
              {role === 'trader'
                ? 'Join Global Exporters Sharing LCL Container Space'
                : 'Publish Vessel Schedules & Maximize Container Utilization'}
            </h2>

            <p className="auth-pane-desc">
              {role === 'trader'
                ? 'Register your commercial trading entity to discover active ocean schedules, compute transparent W/M freight tariffs, and lock container capacity instantaneously.'
                : 'Register your logistics organization to publish fractional container space, manage booking requests, and automate schedule cutoffs across strategic maritime hubs.'}
            </p>

            {/* Stepper overview on side pane */}
            <div className="auth-pane-steps-preview">
              <div className={`pane-step-indicator ${currentStep === 1 ? 'current' : 'done'}`}>
                <div className="pane-step-circle">{currentStep > 1 ? '✓' : '1'}</div>
                <div>
                  <strong>Organization &amp; Contact</strong>
                  <span>Entity details and verified business contact</span>
                </div>
              </div>
              <div className={`pane-step-indicator ${currentStep === 2 ? 'current' : ''}`}>
                <div className="pane-step-circle">2</div>
                <div>
                  <strong>{role === 'trader' ? 'Shipper Profile & Security' : 'Carrier Profile & Security'}</strong>
                  <span>LCL volume preferences and account password</span>
                </div>
              </div>
            </div>

            {/* Role-Specific Trust Badges */}
            <div className="auth-pane-guarantees">
              <div className="auth-guarantee-pill">
                <CheckCircle2 size={14} className="text-emerald" />
                <span>Standardized UN/LOCODE port pairs</span>
              </div>
              <div className="auth-guarantee-pill">
                <CheckCircle2 size={14} className="text-emerald" />
                <span>Deterministic row-level locking</span>
              </div>
              <div className="auth-guarantee-pill">
                <CheckCircle2 size={14} className="text-emerald" />
                <span>Instant cancellation capacity restore</span>
              </div>
            </div>
          </div>

          <div className="auth-pane-footer">
            <div className="auth-pane-security-tag">
              <ShieldCheck size={14} />
              <span>B2B Commercial Onboarding · No Personal Card Required</span>
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================
          RIGHT FORM PANE: Multi-Step Form with Role Customization
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

          {/* If Onboarding is completed (Prototype success screen) */}
          {isCompleted ? (
            <div className="auth-success-screen">
              <div className="auth-success-icon-wrap">
                <CheckCircle2 size={44} className="text-emerald" />
              </div>
              <h1 className="auth-page-title">Onboarding Profile Registered</h1>
              <p className="auth-page-subtitle">
                Welcome to ShipSpace, <strong>{fullName}</strong>! Your account profile for{' '}
                <strong>{companyName}</strong> has been configured as a{' '}
                <strong>{role === 'provider' ? 'Logistics Provider' : 'Cargo Trader'}</strong>.
              </p>

              <div className="auth-handoff-banner" role="status">
                <div className="auth-handoff-icon">
                  <CheckCircle2 size={18} className="text-emerald" />
                </div>
                <div className="auth-handoff-text">
                  <strong>Account Configured Successfully</strong>
                  <p>
                    Account #{createdAccount?.id || createdAccount?.user_id} has been registered and verified. You are now signed in to ShipSpace.
                  </p>
                </div>
              </div>

              <div className="auth-summary-card">
                <div className="summary-card-row">
                  <span className="summary-label">Account ID:</span>
                  <strong className="summary-val text-orange">#{createdAccount?.id || createdAccount?.user_id}</strong>
                </div>
                <div className="summary-card-row">
                  <span className="summary-label">Account Role:</span>
                  <strong className="summary-val text-capitalize">{role}</strong>
                </div>
                <div className="summary-card-row">
                  <span className="summary-label">Company Entity:</span>
                  <strong className="summary-val">{companyName}</strong>
                </div>
                <div className="summary-card-row">
                  <span className="summary-label">Work Email:</span>
                  <strong className="summary-val">{email}</strong>
                </div>
                <div className="summary-card-row">
                  <span className="summary-label">
                    {role === 'trader' ? 'Preferred Corridor:' : 'Operating Base:'}
                  </span>
                  <strong className="summary-val">
                    {role === 'trader' ? traderCorridor : providerBasePort}
                  </strong>
                </div>
              </div>

              <button
                type="button"
                className="auth-submit-btn full-width"
                onClick={handleCompleteAndEnter}
              >
                <span>Enter {role === 'provider' ? 'Provider Dashboard' : 'Trader Marketplace'}</span>
                <ArrowRight size={16} />
              </button>

              <div className="auth-footer-nav">
                <Link to="/login" className="auth-accent-link">
                  Return to Sign In screen →
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* Header Block & Stepper Bar */}
              <div className="auth-header-block">
                <h1 className="auth-page-title">
                  {role === 'trader' ? 'Create Shipper Account' : 'Register Logistics Organization'}
                </h1>
                <p className="auth-page-subtitle">
                  Step {currentStep} of 2:{' '}
                  {currentStep === 1
                    ? 'Commercial entity credentials'
                    : role === 'trader'
                    ? 'Shipping requirements & security'
                    : 'Fleet operations & security'}
                </p>
              </div>

              {/* Visual Progress Stepper */}
              <div className="onboarding-stepper-track" aria-label="Registration Progress">
                <div
                  className={`stepper-segment ${currentStep >= 1 ? 'completed' : ''} ${
                    currentStep === 1 ? 'active' : ''
                  }`}
                >
                  <span className="stepper-bubble">1</span>
                  <span className="stepper-title">Organization</span>
                </div>
                <div className="stepper-line" />
                <div
                  className={`stepper-segment ${currentStep === 2 ? 'active' : ''}`}
                >
                  <span className="stepper-bubble">2</span>
                  <span className="stepper-title">
                    {role === 'trader' ? 'Shipper Profile' : 'Carrier Profile'}
                  </span>
                </div>
              </div>

              {/* STEP 1: ORGANIZATION & CONTACT FORM */}
              {currentStep === 1 && (
                <form className="auth-form-card" onSubmit={handleStep1Submit} noValidate>
                  {/* Role Selector */}
                  <div className="auth-role-tabs-wrap">
                    <label className="auth-field-label">Account Role Type</label>
                    <div className="auth-role-tabs-grid" role="tablist">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={role === 'trader'}
                        className={`auth-role-tab-card ${role === 'trader' ? 'active' : ''}`}
                        onClick={() => setRole('trader')}
                      >
                        <div className="role-tab-icon">
                          <Briefcase size={18} />
                        </div>
                        <div className="role-tab-text">
                          <strong className="role-tab-title">Cargo Trader / Shipper</strong>
                          <span className="role-tab-desc">Book fractional container capacity</span>
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
                        onClick={() => setRole('provider')}
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
                    </div>
                  </div>

                  <div className="auth-2col-grid">
                    {/* Full Name */}
                    <div className={`auth-field-group ${errors.fullName && touched.fullName ? 'has-error' : ''}`}>
                      <label className="auth-field-label" htmlFor="register-name">
                        Primary Contact Name
                      </label>
                      <div className="auth-input-wrapper">
                        <User size={16} className="auth-input-icon" />
                        <input
                          id="register-name"
                          name="fullName"
                          type="text"
                          required
                          placeholder="e.g. Rachel Sterling"
                          className="auth-input"
                          value={fullName}
                          onChange={(e) => {
                            setFullName(e.target.value);
                            if (touched.fullName) setErrors((prev) => ({ ...prev, fullName: '' }));
                          }}
                        />
                      </div>
                      {errors.fullName && touched.fullName && (
                        <span className="auth-inline-error">{errors.fullName}</span>
                      )}
                    </div>

                    {/* Company Name */}
                    <div className={`auth-field-group ${errors.companyName && touched.companyName ? 'has-error' : ''}`}>
                      <label className="auth-field-label" htmlFor="register-company">
                        Company / Commercial Entity
                      </label>
                      <div className="auth-input-wrapper">
                        <Building2 size={16} className="auth-input-icon" />
                        <input
                          id="register-company"
                          name="companyName"
                          type="text"
                          required
                          placeholder={
                            role === 'provider'
                              ? 'e.g. Apex Marine Logistics Pvt Ltd'
                              : 'e.g. Global Garments Export House'
                          }
                          className="auth-input"
                          value={companyName}
                          onChange={(e) => {
                            setCompanyName(e.target.value);
                            if (touched.companyName) setErrors((prev) => ({ ...prev, companyName: '' }));
                          }}
                        />
                      </div>
                      {errors.companyName && touched.companyName && (
                        <span className="auth-inline-error">{errors.companyName}</span>
                      )}
                    </div>
                  </div>

                  <div className="auth-2col-grid">
                    {/* Email */}
                    <div className={`auth-field-group ${errors.email && touched.email ? 'has-error' : ''}`}>
                      <label className="auth-field-label" htmlFor="register-email">
                        Commercial Work Email
                      </label>
                      <div className="auth-input-wrapper">
                        <Mail size={16} className="auth-input-icon" />
                        <input
                          id="register-email"
                          name="email"
                          type="email"
                          required
                          placeholder="rachel@apexmarine.com"
                          className="auth-input"
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value);
                            if (touched.email) setErrors((prev) => ({ ...prev, email: '' }));
                          }}
                        />
                      </div>
                      {errors.email && touched.email && (
                        <span className="auth-inline-error">{errors.email}</span>
                      )}
                    </div>

                    {/* Phone Number */}
                    <div className={`auth-field-group ${errors.phone && touched.phone ? 'has-error' : ''}`}>
                      <label className="auth-field-label" htmlFor="register-phone">
                        Work Contact Phone
                      </label>
                      <div className="auth-input-wrapper">
                        <Phone size={16} className="auth-input-icon" />
                        <input
                          id="register-phone"
                          name="phone"
                          type="tel"
                          required
                          placeholder="+91 98200 12345"
                          className="auth-input"
                          value={phone}
                          onChange={(e) => {
                            setPhone(e.target.value);
                            if (touched.phone) setErrors((prev) => ({ ...prev, phone: '' }));
                          }}
                        />
                      </div>
                      {errors.phone && touched.phone && (
                        <span className="auth-inline-error">{errors.phone}</span>
                      )}
                    </div>
                  </div>

                  <button type="submit" className="auth-submit-btn">
                    <span>Continue to {role === 'trader' ? 'Shipper Profile' : 'Carrier Profile'}</span>
                    <ArrowRight size={16} />
                  </button>
                </form>
              )}

              {/* STEP 2: ROLE-SPECIFIC FREIGHT PROFILE & SECURITY */}
              {currentStep === 2 && (
                <form className="auth-form-card" onSubmit={handleStep2Submit} noValidate>
                  {serverError && (
                    <div
                      className="auth-inline-error-banner"
                      role="alert"
                      style={{
                        padding: '10px 14px',
                        background: '#fef2f2',
                        border: '1px solid #f87171',
                        borderRadius: '6px',
                        color: '#b91c1c',
                        marginBottom: '14px',
                        fontSize: '13px',
                      }}
                    >
                      {serverError}
                    </div>
                  )}

                  {/* Role Specific Section */}
                  <div className="auth-role-custom-box">
                    <div className="custom-box-header">
                      <div className="custom-box-icon">
                        {role === 'trader' ? <Compass size={18} /> : <Anchor size={18} />}
                      </div>
                      <div>
                        <strong className="custom-box-title">
                          {role === 'trader'
                            ? 'LCL Shipping Profile & Trade Corridors'
                            : 'Carrier Operations & Capacity Scope'}
                        </strong>
                        <span className="custom-box-desc">
                          {role === 'trader'
                            ? 'Configure your preferred lanes for tailored space notifications.'
                            : 'Select your fleet classification and primary port operations.'}
                        </span>
                      </div>
                    </div>

                    {role === 'trader' ? (
                      <div className="auth-2col-grid">
                        <div className="auth-field-group">
                          <label className="auth-field-label" htmlFor="trader-corridor">
                            Primary Shipping Lane
                          </label>
                          <select
                            id="trader-corridor"
                            className="auth-select"
                            value={traderCorridor}
                            onChange={(e) => setTraderCorridor(e.target.value)}
                          >
                            <option value="INBOM-AEDXB">INBOM (Mumbai) ↔ AEDXB (Dubai)</option>
                            <option value="CNSHA-NLRTM">CNSHA (Shanghai) ↔ NLRTM (Rotterdam)</option>
                            <option value="SGSIN-DEHAM">SGSIN (Singapore) ↔ DEHAM (Hamburg)</option>
                            <option value="INNSA-SGSIN">INNSA (Nhava Sheva) ↔ SGSIN (Singapore)</option>
                            <option value="ALL">All Global Trade Corridors</option>
                          </select>
                        </div>

                        <div className="auth-field-group">
                          <label className="auth-field-label" htmlFor="trader-volume">
                            Estimated Monthly Volume
                          </label>
                          <select
                            id="trader-volume"
                            className="auth-select"
                            value={traderMonthlyVolume}
                            onChange={(e) => setTraderMonthlyVolume(e.target.value)}
                          >
                            <option value="1-5">Under 5 CBM / month</option>
                            <option value="5-15">5 – 15 CBM / month</option>
                            <option value="15-50">15 – 50 CBM / month</option>
                            <option value="50+">50+ CBM (High Volume Shipper)</option>
                          </select>
                        </div>
                      </div>
                    ) : (
                      <div className="auth-2col-grid">
                        <div className="auth-field-group">
                          <label className="auth-field-label" htmlFor="provider-type">
                            Operator Classification
                          </label>
                          <select
                            id="provider-type"
                            className="auth-select"
                            value={providerOperatingType}
                            onChange={(e) => setProviderOperatingType(e.target.value)}
                          >
                            <option value="nvocc">NVOCC / Freight Consolidator</option>
                            <option value="carrier">Vessel Operating Common Carrier</option>
                            <option value="cfs">Container Freight Station (CFS) Operator</option>
                          </select>
                        </div>

                        <div className="auth-field-group">
                          <label className="auth-field-label" htmlFor="provider-port">
                            Primary Hub Port (UN/LOCODE)
                          </label>
                          <select
                            id="provider-port"
                            className="auth-select"
                            value={providerBasePort}
                            onChange={(e) => setProviderBasePort(e.target.value)}
                          >
                            <option value="INNSA">INNSA — Nhava Sheva / Mumbai</option>
                            <option value="CNSHA">CNSHA — Shanghai Port</option>
                            <option value="SGSIN">SGSIN — Port of Singapore</option>
                            <option value="NLRTM">NLRTM — Port of Rotterdam</option>
                            <option value="AEDXB">AEDXB — Port of Dubai</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Password & Confirm Password */}
                  <div className="auth-2col-grid">
                    <div className={`auth-field-group ${errors.password && touched.password ? 'has-error' : ''}`}>
                      <label className="auth-field-label" htmlFor="register-password">
                        Account Password (min 8 chars)
                      </label>
                      <div className="auth-input-wrapper">
                        <Lock size={16} className="auth-input-icon" />
                        <input
                          id="register-password"
                          name="password"
                          type={showPassword ? 'text' : 'password'}
                          required
                          placeholder="Min 8 characters"
                          className="auth-input"
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            if (touched.password) setErrors((prev) => ({ ...prev, password: '' }));
                          }}
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
                        <span className="auth-inline-error">{errors.password}</span>
                      )}
                    </div>

                    <div className={`auth-field-group ${errors.confirmPassword && touched.confirmPassword ? 'has-error' : ''}`}>
                      <label className="auth-field-label" htmlFor="register-confirm-password">
                        Confirm Password
                      </label>
                      <div className="auth-input-wrapper">
                        <Lock size={16} className="auth-input-icon" />
                        <input
                          id="register-confirm-password"
                          name="confirmPassword"
                          type={showConfirmPassword ? 'text' : 'password'}
                          required
                          placeholder="Re-enter password"
                          className="auth-input"
                          value={confirmPassword}
                          onChange={(e) => {
                            setConfirmPassword(e.target.value);
                            if (touched.confirmPassword) {
                              setErrors((prev) => ({ ...prev, confirmPassword: '' }));
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="password-toggle-btn"
                          onClick={() => setShowConfirmPassword((prev) => !prev)}
                          title={showConfirmPassword ? 'Hide password' : 'Show password'}
                          aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                        >
                          {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      {errors.confirmPassword && touched.confirmPassword && (
                        <span className="auth-inline-error">{errors.confirmPassword}</span>
                      )}
                    </div>
                  </div>

                  {/* Terms & Conditions Checkbox */}
                  <div className={`auth-checkbox-row ${errors.agreedToTerms && touched.agreedToTerms ? 'has-error' : ''}`}>
                    <label className="custom-checkbox-label">
                      <input
                        type="checkbox"
                        checked={agreedToTerms}
                        onChange={(e) => {
                          setAgreedToTerms(e.target.checked);
                          if (touched.agreedToTerms) {
                            setErrors((prev) => ({ ...prev, agreedToTerms: '' }));
                          }
                        }}
                        className="custom-checkbox-input"
                      />
                      <span className="checkbox-text">
                        I agree to the Commercial Marketplace Terms of Service, Weight or Measure Tariff
                        Rules, and Privacy Policy.
                      </span>
                    </label>
                    {errors.agreedToTerms && touched.agreedToTerms && (
                      <span className="auth-inline-error block mt-1">{errors.agreedToTerms}</span>
                    )}
                  </div>

                  {/* Dual Action Buttons (Back + Submit) */}
                  <div className="auth-btn-row">
                    <button
                      type="button"
                      className="btn-secondary-outline auth-btn-back"
                      onClick={() => setCurrentStep(1)}
                    >
                      <ArrowLeft size={16} />
                      <span>Back to Step 1</span>
                    </button>

                    <button
                      type="submit"
                      className="auth-submit-btn flex-1"
                      disabled={isSubmitting}
                      aria-busy={isSubmitting}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          <span>Configuring Account Profile...</span>
                        </>
                      ) : (
                        <>
                          <UserPlus size={16} />
                          <span>Create Account</span>
                          <ArrowRight size={16} />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Login Redirect Footer */}
              <div className="auth-footer-nav">
                <span>Already have a verified commercial account?</span>
                <Link to={`/login?role=${role}`} className="auth-accent-link">
                  Sign in to your portal →
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
