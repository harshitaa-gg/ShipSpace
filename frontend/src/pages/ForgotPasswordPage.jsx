import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Mail,
  ArrowRight,
  ArrowLeft,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  Info,
  Loader2,
  Lock,
  Anchor,
  Compass,
} from 'lucide-react';
import { ShipSpaceLogoIcon } from '../components/NavbarAndSidebar';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const validate = (val) => {
    if (!val.trim()) {
      return 'Commercial work email is required.';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim())) {
      return 'Please enter a valid commercial email address.';
    }
    return '';
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setTouched(true);
    const err = validate(email);
    if (err) {
      setError(err);
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitted(true);
    }, 600);
  };

  return (
    <div className="auth-split-layout">
      {/* ===================================================================
          LEFT BRAND PANE: Security & Recovery Architecture
          =================================================================== */}
      <div className="auth-brand-pane">
        <div className="auth-brand-inner">
          <Link to="/" className="auth-pane-logo-link">
            <ShipSpaceLogoIcon size={34} />
            <div className="auth-pane-logo-text">
              <span className="auth-pane-brand-title">ShipSpace</span>
              <span className="auth-pane-brand-sub">ACCOUNT RECOVERY</span>
            </div>
          </Link>

          <div className="auth-pane-content">
            <div className="auth-pane-badge">ENTERPRISE CREDENTIAL SECURITY</div>

            <h2 className="auth-pane-heading">
              Secure Account Recovery for Commercial Freight Portals
            </h2>

            <p className="auth-pane-desc">
              ShipSpace implements cryptographic authentication standards to protect commercial voyage
              manifests, trader booking reservations, and logistics provider tariff configurations.
            </p>

            <div className="auth-pane-feature-list">
              <div className="auth-pane-feature-item">
                <div className="pane-feature-icon">
                  <Lock size={18} />
                </div>
                <div>
                  <strong>HMAC Signed Recovery Tokens</strong>
                  <span>Short-lived single-use recovery links protect account integrity</span>
                </div>
              </div>
              <div className="auth-pane-feature-item">
                <div className="pane-feature-icon">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <strong>Audit Trail Transparency</strong>
                  <span>All recovery attempts are logged in database security audit tables</span>
                </div>
              </div>
              <div className="auth-pane-feature-item">
                <div className="pane-feature-icon">
                  <Anchor size={18} />
                </div>
                <div>
                  <strong>Zero Operational Disruption</strong>
                  <span>Active container reservations remain locked and unaffected</span>
                </div>
              </div>
            </div>
          </div>

          <div className="auth-pane-footer">
            <div className="auth-pane-security-tag">
              <ShieldCheck size={14} />
              <span>TLS 1.3 Transport Encryption · Zero Plaintext Storage</span>
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================
          RIGHT FORM PANE: Recovery Request or Simulation Confirmation
          =================================================================== */}
      <div className="auth-form-pane">
        <div className="auth-form-container">
          {/* Top Return Link */}
          <div className="auth-top-nav">
            <Link to="/login" className="auth-back-link">
              <ArrowLeft size={16} />
              <span>Back to Sign In</span>
            </Link>
          </div>

          {submitted ? (
            <div className="auth-success-screen">
              <div className="auth-success-icon-wrap">
                <CheckCircle2 size={44} className="text-emerald" />
              </div>
              <h1 className="auth-page-title">Password Reset Request Sent</h1>
              <p className="auth-page-subtitle">
                Instructions to reset your password have been generated for <strong>{email}</strong>.
              </p>

              <div className="auth-handoff-banner" role="status">
                <div className="auth-handoff-icon">
                  <CheckCircle2 size={18} className="text-emerald" />
                </div>
                <div className="auth-handoff-text">
                  <strong>Check Your Email</strong>
                  <p>
                    If an account is registered with this email address, you will receive password reset instructions shortly.
                    Please check your inbox and spam folder.
                  </p>
                </div>
              </div>

              <div className="auth-btn-row">
                <Link to="/login" className="auth-submit-btn flex-1">
                  <span>Return to Sign In</span>
                  <ArrowRight size={16} />
                </Link>
                <button
                  type="button"
                  className="btn-secondary-outline"
                  onClick={() => {
                    setSubmitted(false);
                    setEmail('');
                    setTouched(false);
                  }}
                >
                  <span>Reset Another</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="auth-header-block">
                <h1 className="auth-page-title">Reset your password</h1>
                <p className="auth-page-subtitle">
                  Enter your registered commercial work email and we will send password reset instructions.
                </p>
              </div>

              <form className="auth-form-card" onSubmit={handleSubmit} noValidate>
                <div className={`auth-field-group ${error && touched ? 'has-error' : ''}`}>
                  <label className="auth-field-label" htmlFor="forgot-email">
                    Registered Work Email
                  </label>
                  <div className="auth-input-wrapper">
                    <Mail size={16} className="auth-input-icon" />
                    <input
                      id="forgot-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      placeholder="e.g. name@company.com"
                      className="auth-input"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (touched) setError(validate(e.target.value));
                      }}
                      onBlur={() => {
                        setTouched(true);
                        setError(validate(email));
                      }}
                    />
                  </div>
                  {error && touched && (
                    <span className="auth-inline-error" role="alert">
                      {error}
                    </span>
                  )}
                </div>

                <button
                  type="submit"
                  className="auth-submit-btn"
                  disabled={isSubmitting}
                  aria-busy={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Dispatching Reset Request...</span>
                    </>
                  ) : (
                    <>
                      <KeyRound size={16} />
                      <span>Send Recovery Instructions</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>

              <div className="auth-footer-nav">
                <span>Remember your password?</span>
                <Link to="/login" className="auth-accent-link">
                  Return to Sign In →
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
