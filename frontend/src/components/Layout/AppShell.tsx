import React from 'react';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import Footer from './Footer';
import './AppShell.css';

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-root">
      <Navbar />
      <div className="app-content">
        <Sidebar />
        <main className="main container">
          {children}
        </main>
      </div>
      <Footer />
    </div>
  );
}
