import React, { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { IdentityProvider } from './context/IdentityContext';
import NavbarAndSidebar from './components/NavbarAndSidebar';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import SearchListingsPage from './pages/SearchListingsPage';
import MyBookingsPage from './pages/MyBookingsPage';
import ProviderDashboardPage from './pages/ProviderDashboardPage';
import AdminOverviewPage from './pages/AdminOverviewPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';

export default function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <IdentityProvider>
      <BrowserRouter>
        <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
          <NavbarAndSidebar
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
          />

          <div className="app-main-viewport">
            <main className="app-content-area">
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/search" element={<SearchListingsPage />} />
                <Route path="/bookings" element={<MyBookingsPage />} />
                <Route path="/provider" element={<ProviderDashboardPage />} />
                <Route path="/admin" element={<AdminOverviewPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              </Routes>
            </main>
            <Footer />
          </div>
        </div>
      </BrowserRouter>
    </IdentityProvider>
  );
}
